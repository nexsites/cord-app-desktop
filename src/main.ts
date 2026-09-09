import {
  IUpdateInfo,
  UpdateSourceType,
  updateElectronApp,
} from "update-electron-app";

import {
  BrowserWindow,
  Notification,
  app,
  autoUpdater,
  dialog,
  shell,
} from "electron";
import started from "electron-squirrel-startup";

import { initAutoLaunch } from "./native/autoLaunch";
import { config } from "./native/config";
import { initDiscordRpc } from "./native/discordRpc";
import { initTray } from "./native/tray";
import { initVirtualMic } from "./native/virtualMic";
import { BUILD_URL, createMainWindow, mainWindow } from "./native/window";

// Squirrel-specific logic
// create/remove shortcuts on Windows when installing / uninstalling
// we just need to close out of the app immediately
if (started) {
  app.quit();
}

// disable hw-accel if so requested
if (!config.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}

// ensure only one copy of the application can run
const acquiredLock = app.requestSingleInstanceLock();

// Cord: how the app tells the user an update is ready to install.
//
// `update-electron-app` runs in the background: on launch and every 10 minutes
// after, it polls https://update.electronjs.org/nexsites/cord-app-desktop/
// win32-x64/<current-version>. If a newer release is out on GitHub, it
// downloads it silently in the background. When the download completes,
// Squirrel has staged the update — the app just needs to restart to apply it.
//
// Upstream stoat's default was a silent Windows toast that read "Restart the
// app to install the update." That was easy to miss. We surface it as a real
// in-app dialog on the main window with a "Restart Cord" button that quits +
// installs in one click — a "keep restarting to see changes" complaint from
// the operator directly.
//
// The toast is kept as a fallback for the pathological case where an update
// resolves before the main window exists (extremely rare — updates land after
// download, which takes seconds; the window is up in milliseconds).
const onNotifyUser = (info: IUpdateInfo) => {
  const versionLine = info.releaseName
    ? `Cord ${info.releaseName} is ready to install.`
    : "A new version of Cord is ready to install.";
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    dialog
      .showMessageBox(win, {
        type: "info",
        title: "Cord update ready",
        message: versionLine,
        detail:
          "Restart Cord to apply the update. Your session and login are preserved.",
        buttons: ["Restart Cord", "Later"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      .then(({ response }) => {
        // 0 = Restart, 1 = Later. On Later, the same dialog surfaces again on
        // the next poll (~10 min) — the update stays staged so nothing is lost.
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      })
      .catch(() => {
        /* dialog can't be shown (e.g. main window closed mid-race) — fall back */
        new Notification({
          title: "Cord update ready",
          body: "Restart Cord to install.",
          silent: true,
        }).show();
      });
  } else {
    new Notification({
      title: "Cord update ready",
      body: "Restart Cord to install.",
      silent: true,
    }).show();
  }
};

if (acquiredLock) {
  // start auto update logic
  //
  // Cord: updates are served from cord-app.com directly instead of GitHub
  // releases via update.electronjs.org. Reason: the operator has a wildly
  // asymmetric home connection (~230 Mbps down, ~0.7 Mbps up), so uploading
  // 400+ MB of Squirrel artifacts to GitHub per release takes ~90 minutes.
  // Serving from cord-app.com is a local `cp` on apex — instant to publish,
  // downloads served through the existing Cloudflare tunnel with CF's CDN in
  // front for the users.
  //
  // The Squirrel autoUpdater fetches RELEASES + the current nupkg from this
  // base URL exactly as it would from update.electronjs.org — the endpoint
  // just isn't hosted by us running Electron's proxy.
  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.StaticStorage,
      baseUrl: "https://cord-app.com/download/win32-x64/",
    },
    onNotifyUser,
  });

  // create and configure the app when electron is ready
  app.on("ready", () => {
    // create window and application contexts
    createMainWindow();

    // save first launch state
    if (config.firstLaunch) {
      // Doesn't do anything right now. Used to enable auto start, but that behaviour was removed.
      // Left in case it gets used in the future.
      config.firstLaunch = false;
    }

    initTray();
    initDiscordRpc();
    initVirtualMic();
    initAutoLaunch();

    // Windows specific fix for notifications
    if (process.platform === "win32") {
      app.setAppUserModelId("com.cord.notifications");
    }
  });

  // focus the window if we try to launch again
  app.on("second-instance", () => {
    mainWindow.show();
    mainWindow.restore();
    mainWindow.focus();
  });

  // macOS specific behaviour to keep app active in dock:
  // (irrespective of the minimise-to-tray option)

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // ensure URLs launch in external context
  app.on("web-contents-created", (_, contents) => {
    // prevent navigation out of build URL origin
    contents.on("will-navigate", (event, navigationUrl) => {
      if (new URL(navigationUrl).origin !== BUILD_URL.origin) {
        event.preventDefault();
      }
    });

    // handle links externally
    contents.setWindowOpenHandler(({ url }) => {
      if (
        url.startsWith("http:") ||
        url.startsWith("https:") ||
        url.startsWith("mailto:")
      ) {
        setImmediate(() => {
          shell.openExternal(url);
        });
      }

      return { action: "deny" };
    });
  });
} else {
  app.quit();
}
