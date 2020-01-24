const electron = require('electron')
const fs = require('fs')
const path = require('path')
const url = require('url');
const app = electron.app // Module to control application life.
const protocol = electron.protocol // Module to control protocol handling
const BrowserWindow = electron.BrowserWindow // Module to create native browser window.
const webContents = electron.webContents
const session = electron.session
const ipc = electron.ipcMain

if (process.platform === 'win32') {
  (async function () {
  var squirrelCommand = process.argv[1];
  if (squirrelCommand === "--squirrel-install" || squirrelCommand === "--squirrel-updated") {
    await registryInstaller.install();
  }
  if (squirrelCommand == '--squirrel-uninstall') {
    await registryInstaller.uninstall();
  }
  if (require('electron-squirrel-startup')) {
    app.quit()
  }
  })();
}

// workaround for flicker when focusing app (https://github.com/electron/electron/issues/17942)
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows', 'true')

var userDataPath = app.getPath('userData')
// Specify flash path, supposing it is placed in the same directory with main.js. 
let pluginName
switch (process.platform) {
   case 'win32':
      pluginName = 'pepflashplayer.dll'
      break
   case 'darwin':
      pluginName = 'PepperFlashPlayer.plugin'
      break
   case 'linux':
      pluginName = 'libpepflashplayer.so'
      break
}
app.commandLine.appendSwitch('ppapi-flash-path', path.join(__dirname, pluginName))

var dbPath = userDataPath + (process.platform === 'win32' ? '\\IndexedDB\\file__0.indexeddb.leveldb' : '/IndexedDB/file__0.indexeddb.leveldb')

if (process.argv.some(item => item.includes('rename-db'))) {
  try {
    fs.renameSync(dbPath, dbPath + '-' + Date.now() + '.recovery')
  } catch (e) {
    console.warn('renaming database failed', e)
    app.quit()
  }
}

const browserPage = 'file://' + __dirname + '/index.html'

var mainWindow = null
var mainMenu = null
var isFocusMode = false
var appIsReady = false

var saveWindowBounds = function () {
  if (mainWindow) {
    fs.writeFileSync(path.join(userDataPath, 'windowBounds.json'), JSON.stringify(mainWindow.getBounds()))
  }
}

function sendIPCToWindow (window, action, data) {
  // if there are no windows, create a new one
  if (!mainWindow) {
    createWindow(function () {
      mainWindow.webContents.send(action, data || {})
    })
  } else {
    mainWindow.webContents.send(action, data || {})
  }
}

function openTabInWindow (url) {
  sendIPCToWindow(mainWindow, 'addTab', {
    url: url
  })
}

function handleCommandLineArguments (argv) {
  // the "ready" event must occur before this function can be used
  if (argv) {
    argv.forEach(function (arg) {
      if (arg && arg.toLowerCase() !== __dirname.toLowerCase()) {
        if (arg.indexOf('://') !== -1) {
          sendIPCToWindow(mainWindow, 'addTab', {
            url: arg
          })
        } else if (/[A-Z]:[/\\].*\.html?$/.test(arg)) {
          //local files on Windows
          sendIPCToWindow(mainWindow, 'addTab', {
            url: "file://" + arg
          })
        }
      }
    })
  }
}

function createWindow (cb) {
  var savedBounds = fs.readFile(path.join(userDataPath, 'windowBounds.json'), 'utf-8', function (e, data) {
    var bounds

    if (data) {
      try {
        bounds = JSON.parse(data)
      } catch (e) {
        console.warn('error parsing window bounds file: ', e)
      }
    }
    if (e || !data || !bounds) { // there was an error, probably because the file doesn't exist
      var size = electron.screen.getPrimaryDisplay().workAreaSize
      var bounds = {
        x: 0,
        y: 0,
        width: size.width,
        height: size.height
      }
    }

    // maximizes the window frame in windows 10
    // fixes https://github.com/minbrowser/min/issues/214
    // should be removed once https://github.com/electron/electron/issues/4045 is fixed
    if (process.platform === 'win32') {
      if (bounds.x === 0 || bounds.y === 0 || bounds.x === -8 || bounds.y === -8) {
        var screenSize = electron.screen.getPrimaryDisplay().workAreaSize
        if ((screenSize.width === bounds.width || bounds.width - screenSize.width === 16) && (screenSize.height === bounds.height || bounds.height - screenSize.height === 16)) {
          var shouldMaximize = true
        }
      }
    }

    createWindowWithBounds(bounds, shouldMaximize)

    if (cb) {
      cb()
    }
  })
}

function createWindowWithBounds (bounds, shouldMaximize) {
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: (process.platform === 'win32' ? 400 : 320), // controls take up more horizontal space on Windows
    minHeight: 350,
    titleBarStyle: 'hiddenInset',
    icon: __dirname + '/icons/icon256.png',
    frame: process.platform !== 'win32',
    alwaysOnTop: settings.get('windowAlwaysOnTop'),
    autoHideMenuBar: true,
    backgroundColor: '#fff', // the value of this is ignored, but setting it seems to work around https://github.com/electron/electron/issues/10559
    webPreferences: {
      nodeIntegration: true,
      additionalArguments: ['--user-data-path=' + userDataPath],
      plugins: true
    }
  })

  // and load the index.html of the app.
  mainWindow.loadURL(browserPage)

  if (shouldMaximize) {
    mainWindow.maximize()

    mainWindow.webContents.on('did-finish-load', function () {
      sendIPCToWindow(mainWindow, 'maximize')
    })
  }

  mainWindow.on('close', function () {
    destroyAllViews()
    // save the window size for the next launch of the app
    saveWindowBounds()
  })

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })

  mainWindow.on('focus', function () {
    sendIPCToWindow(mainWindow, 'windowFocus')
  })

  mainWindow.on('minimize', function () {
    sendIPCToWindow(mainWindow, 'minimize')
  })

  mainWindow.on('maximize', function () {
    sendIPCToWindow(mainWindow, 'maximize')
  })

  mainWindow.on('unmaximize', function () {
    sendIPCToWindow(mainWindow, 'unmaximize')
  })

  mainWindow.on('enter-full-screen', function () {
    sendIPCToWindow(mainWindow, 'enter-full-screen')
  })

  mainWindow.on('leave-full-screen', function () {
    sendIPCToWindow(mainWindow, 'leave-full-screen')
  })

  mainWindow.on('enter-html-full-screen', function () {
    sendIPCToWindow(mainWindow, 'enter-html-full-screen')
  })

  mainWindow.on('leave-html-full-screen', function () {
    sendIPCToWindow(mainWindow, 'leave-html-full-screen')
  })

  mainWindow.on('app-command', function (e, command) {
    if (command === 'browser-backward') {
      sendIPCToWindow(mainWindow, 'goBack')
    } else if (command === 'browser-forward') {
      sendIPCToWindow(mainWindow, 'goForward')
    }
  })

  // prevent remote pages from being loaded using drag-and-drop, since they would have node access
  mainWindow.webContents.on('will-navigate', function (e, url) {
    if (url !== browserPage) {
      e.preventDefault()
    }
  })

  return mainWindow
}

if (!app.requestSingleInstanceLock())
{
        app.quit()
}
else
{
   app.on('second-instance', (event, argv, cwd) => {
      /* ... */

      console.log( argv )

      if (mainWindow) {
         if (mainWindow.isMinimized()) mainWindow.restore();
         mainWindow.show();
         mainWindow.focus();
	 if (argv.length > 2 && argv[2].localeCompare(global.URLToOpen))
	 {
           global.URLToOpen =  (argv.length > 2 ? argv[2] : 'https://www.ordissinaute.com/search')
           sendIPCToWindow(mainWindow, 'addTab', {
              url: global.URLToOpen
           })
	 }
      }
   })
}

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function () {
  appIsReady = true

  createWindow(function () {
    mainWindow.webContents.on('did-finish-load', function () {
      // if a URL was passed as a command line argument (probably because Min is set as the default browser on Linux), open it.
      if (process.argv.length > 2 && process.argv[2].localeCompare(global.URLToOpen))
      {
        global.URLToOpen =  (process.argv.length > 2 ? process.argv[2] : 'https://www.ordissinaute.com/search')
        sendIPCToWindow(mainWindow, 'addTab', {
          url: global.URLToOpen
        })
      }
      mainWindow.setMenu(null);
      // mainWindow.openDevTools()
    })
  })

  // createAppMenu()
  // createDockMenu()
  registerProtocols()
})

app.on('open-url', function (e, url) {
  if (appIsReady) {
    sendIPCToWindow(mainWindow, 'addTab', {
      url: url
    })
  } else {
    global.URLToOpen = url // this will be handled later in the createWindow callback
  }
})

app.on('second-instance', function (e, argv, workingDir) {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
    // add a tab with the new URL
    handleCommandLineArguments(argv)
  }
})

/**
 * Emitted when the application is activated, which usually happens when clicks on the applications's dock icon
 * https://github.com/electron/electron/blob/master/docs/api/app.md#event-activate-os-x
 *
 * Opens a new tab when all tabs are closed, and min is still open by clicking on the application dock icon
 */
app.on('activate', function (/* e, hasVisibleWindows */) {
  if (!mainWindow && appIsReady) { // sometimes, the event will be triggered before the app is ready, and creating new windows will fail
    createWindow()
  }
})

ipc.on('focusMainWebContents', function () {
  mainWindow.webContents.focus()
})

ipc.on('showSecondaryMenu', function (event, data) {
  if (mainMenu) {
    mainMenu.popup(mainWindow, {
      x: data.x,
      y: data.y,
      async: true
    })
  }
})

function registerProtocols () {
  protocol.registerStringProtocol('mailto', function (req, cb) {
    electron.shell.openExternal(req.url)
    return null
  })
}
