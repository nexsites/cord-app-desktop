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
import {
  BUILD_URL,
  closeSplash,
  createMainWindow,
  createSplashWindow,
  mainWindow,
  setSplashStatus,
} from "./native/window";

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
  // Cord: launch flow is Discord-style.
  //
  //   1. Splash window opens immediately (small, frameless, sweeping bar).
  //   2. `update-electron-app` fires an update check against cord-app.com.
  //   3. autoUpdater emits events we translate into the splash's status text.
  //   4. If an update is available, splash sits on "Downloading update…" while
  //      Squirrel downloads it, then "Restarting to apply update…" and calls
  //      quitAndInstall — user never sees the main window on this launch.
  //   5. If no update is available (or the check hangs > 5s), close the splash
  //      and open the main window normally.
  //
  // The 5s bail-out matters: update polling can stall silently — CF cache miss,
  // proxy blip, whatever — and we should not block Cord's launch indefinitely
  // waiting on the update service. update-electron-app keeps polling in the
  // background either way, so the user gets any update on the next 10-min tick
  // via `onNotifyUser`.

  let updateResolved = false;
  const openMainWindowOnce = () => {
    if (updateResolved) return;
    updateResolved = true;
    closeSplash();
    createMainWindow();
    initTray();
    initDiscordRpc();
    initVirtualMic();
    initAutoLaunch();
    if (process.platform === "win32") {
      app.setAppUserModelId("com.cord.notifications");
    }
    if (config.firstLaunch) {
      config.firstLaunch = false;
    }
  };

  app.on("ready", () => {
    createSplashWindow();

    // wire autoUpdater events to the splash before update-electron-app fires
    autoUpdater.on("checking-for-update", () => {
      setSplashStatus("Checking for updates…");
    });
    autoUpdater.on("update-not-available", () => {
      openMainWindowOnce();
    });
    autoUpdater.on("update-available", () => {
      setSplashStatus("Downloading update…");
    });
    autoUpdater.on("update-downloaded", () => {
      setSplashStatus("Restarting to apply update…");
      // Small delay so the user reads the message before the app dies.
      setTimeout(() => autoUpdater.quitAndInstall(), 700);
    });
    autoUpdater.on("error", (err) => {
      // update service unreachable / bad manifest / etc. — treat as "no update,
      // open the app" so a broken update endpoint never bricks the launcher.
      console.warn("[cord] update check error:", err?.message || err);
      openMainWindowOnce();
    });

    // fire the update check
    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.StaticStorage,
        baseUrl: "https://cord-app.com/download/win32-x64/",
      },
      onNotifyUser, // still used for update-available events after the app is running
    });

    // hard timeout: if the update check hasn't resolved either way in 5 s,
    // open the app anyway. Background polling continues.
    setTimeout(() => {
      if (!updateResolved) {
        setSplashStatus("Taking longer than usual — opening Cord…");
        setTimeout(openMainWindowOnce, 400);
      }
    }, 5000);
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
