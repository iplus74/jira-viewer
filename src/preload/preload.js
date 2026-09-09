'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { splitAttachmentMarkers } = require('../shared/attachmentMarker');

contextBridge.exposeInMainWorld('jiraApi', {
  search: (payload) => ipcRenderer.invoke('jira:search', payload),
  getIssue: (payload) => ipcRenderer.invoke('jira:getIssue', payload),
  getTransitions: (payload) => ipcRenderer.invoke('jira:getTransitions', payload),
  transitionIssue: (payload) => ipcRenderer.invoke('jira:transitionIssue', payload),
  addComment: (payload) => ipcRenderer.invoke('jira:addComment', payload),
  searchUsers: (payload) => ipcRenderer.invoke('jira:searchUsers', payload),
  openInBrowser: (webUrl) => ipcRenderer.invoke('jira:openInBrowser', webUrl),
  getSummary: (payload) => ipcRenderer.invoke('ai:getSummary', payload),
  renderMarkdown: (markdownText) => ipcRenderer.invoke('util:renderMarkdown', markdownText),
  chooseDownloadFolder: () => ipcRenderer.invoke('settings:chooseDownloadFolder'),
  getDefaultAgyWorkDir: () => ipcRenderer.invoke('settings:getDefaultAgyWorkDir'),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath)
});

contextBridge.exposeInMainWorld('attachmentUtil', {
  splitAttachmentMarkers
});

