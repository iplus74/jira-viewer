'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { splitAttachmentMarkers } = require('../shared/attachmentMarker');

contextBridge.exposeInMainWorld('jiraApi', {
  search: (payload) => ipcRenderer.invoke('jira:search', payload),
  getIssue: (payload) => ipcRenderer.invoke('jira:getIssue', payload),
  getTransitions: (payload) => ipcRenderer.invoke('jira:getTransitions', payload),
  transitionIssue: (payload) => ipcRenderer.invoke('jira:transitionIssue', payload),
  openInBrowser: (webUrl) => ipcRenderer.invoke('jira:openInBrowser', webUrl),
  getSummary: (payload) => ipcRenderer.invoke('ai:getSummary', payload),
  chooseDownloadFolder: () => ipcRenderer.invoke('settings:chooseDownloadFolder'),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath)
});

contextBridge.exposeInMainWorld('attachmentUtil', {
  splitAttachmentMarkers
});

