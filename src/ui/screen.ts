// The OpenTUI adapter keeps the original public screen API for the REPL.
export {
  appendTerminalOutput, clearScreen, clearTerminalPanel, clipText, createInput,
  finishTerminalPanel, initScreen, layoutSupported, listenKeys, parseKeys, pick,
  resetScreen, setActivityStatus, setAgentNames, setCommands, setContextFiles,
  setKeyInterceptor, setNextInput, setPermissionMode, setScreenStatus,
  startBackgroundCommandListener, startTerminalPanel, teardownScreen,
  terminalPanelState, terminalPanelVisible, terminalWidth, toggleTerminalPanel,
  type CommandInfo, type InputController, type Key, type PickItem,
} from "./tui.js";
