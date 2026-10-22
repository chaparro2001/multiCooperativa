/* @ds-bundle: {"format": 4, "namespace": "MultiCooperativa", "components": [{"name": "Button"}, {"name": "HeaderAction"}, {"name": "Chip"}, {"name": "SegmentedButtons"}, {"name": "TextField"}, {"name": "DateField"}, {"name": "FieldGroup"}, {"name": "FormSummary"}, {"name": "Checkbox"}, {"name": "Switch"}, {"name": "Badge"}, {"name": "CountBadge"}, {"name": "Banner"}, {"name": "AiNotice"}, {"name": "ProgressBar"}, {"name": "Loading"}, {"name": "ErrorState"}, {"name": "EmptyState"}, {"name": "ListRow"}, {"name": "Card"}, {"name": "Money"}, {"name": "HomeTile"}, {"name": "AttentionItem"}, {"name": "VoteOption"}, {"name": "VoteTally"}, {"name": "MapCard"}, {"name": "ChatBubble"}, {"name": "SourceCard"}, {"name": "Composer"}, {"name": "HeroCard"}, {"name": "ActionBar"}, {"name": "AppLogo"}, {"name": "Icon"}]} */
(function () {
  var React = window.React, h = React.createElement, useState = React.useState;
  var ICONS = {"map-marker":"M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z","directions":"M14,14.5V12H10V15H8V11A1,1 0 0,1 9,10H14V7.5L17.5,11M21.71,11.29L12.71,2.29H12.7C12.31,1.9 11.68,1.9 11.29,2.29L2.29,11.29C1.9,11.68 1.9,12.32 2.29,12.71L11.29,21.71C11.68,22.09 12.31,22.1 12.71,21.71L21.71,12.71C22.1,12.32 22.1,11.68 21.71,11.29Z","account-check-outline":"M21.1,12.5L22.5,13.91L15.97,20.5L12.5,17L13.9,15.59L15.97,17.67L21.1,12.5M11,4A4,4 0 0,1 15,8A4,4 0 0,1 11,12A4,4 0 0,1 7,8A4,4 0 0,1 11,4M11,6A2,2 0 0,0 9,8A2,2 0 0,0 11,10A2,2 0 0,0 13,8A2,2 0 0,0 11,6M11,13C11.68,13 12.5,13.09 13.41,13.26L11.74,14.93L11,14.9C8.03,14.9 4.9,16.36 4.9,17V18.1H11.1L13,20H3V17C3,14.34 8.33,13 11,13Z","account-group-outline":"M12,5A3.5,3.5 0 0,0 8.5,8.5A3.5,3.5 0 0,0 12,12A3.5,3.5 0 0,0 15.5,8.5A3.5,3.5 0 0,0 12,5M12,7A1.5,1.5 0 0,1 13.5,8.5A1.5,1.5 0 0,1 12,10A1.5,1.5 0 0,1 10.5,8.5A1.5,1.5 0 0,1 12,7M5.5,8A2.5,2.5 0 0,0 3,10.5C3,11.44 3.53,12.25 4.29,12.68C4.65,12.88 5.06,13 5.5,13C5.94,13 6.35,12.88 6.71,12.68C7.08,12.47 7.39,12.17 7.62,11.81C6.89,10.86 6.5,9.7 6.5,8.5C6.5,8.41 6.5,8.31 6.5,8.22C6.2,8.08 5.86,8 5.5,8M18.5,8C18.14,8 17.8,8.08 17.5,8.22C17.5,8.31 17.5,8.41 17.5,8.5C17.5,9.7 17.11,10.86 16.38,11.81C16.5,12 16.63,12.15 16.78,12.3C16.94,12.45 17.1,12.58 17.29,12.68C17.65,12.88 18.06,13 18.5,13C18.94,13 19.35,12.88 19.71,12.68C20.47,12.25 21,11.44 21,10.5A2.5,2.5 0 0,0 18.5,8M12,14C9.66,14 5,15.17 5,17.5V19H19V17.5C19,15.17 14.34,14 12,14M4.71,14.55C2.78,14.78 0,15.76 0,17.5V19H3V17.07C3,16.06 3.69,15.22 4.71,14.55M19.29,14.55C20.31,15.22 21,16.06 21,17.07V19H24V17.5C24,15.76 21.22,14.78 19.29,14.55M12,16C13.53,16 15.24,16.5 16.23,17H7.77C8.76,16.5 10.47,16 12,16Z","account-outline":"M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6M12,13C14.67,13 20,14.33 20,17V20H4V17C4,14.33 9.33,13 12,13M12,14.9C9.03,14.9 5.9,16.36 5.9,17V18.1H18.1V17C18.1,16.36 14.97,14.9 12,14.9Z","alert-circle-outline":"M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z","alert-outline":"M12,2L1,21H23M12,6L19.53,19H4.47M11,10V14H13V10M11,16V18H13V16","arrow-left":"M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z","bullhorn-outline":"M12,8H4A2,2 0 0,0 2,10V14A2,2 0 0,0 4,16H5V20A1,1 0 0,0 6,21H8A1,1 0 0,0 9,20V16H12L17,20V4L12,8M15,15.6L13,14H4V10H13L15,8.4V15.6M21.5,12C21.5,13.71 20.54,15.26 19,16V8C20.53,8.75 21.5,10.3 21.5,12Z","calendar-edit-outline":"M21.7 13.35L20.7 14.35L18.65 12.35L19.65 11.35C19.85 11.14 20.19 11.13 20.42 11.35L21.7 12.63C21.89 12.83 21.89 13.15 21.7 13.35M12 18.94V21H14.06L20.12 14.88L18.07 12.88L12 18.94M5 19H10V21H5C3.9 21 3 20.11 3 19V5C3 3.9 3.9 3 5 3H6V1H8V3H16V1H18V3H19C20.11 3 21 3.9 21 5V9H5V19M5 5V7H19V5H5Z","calendar-outline":"M12 12H17V17H12V12M19 3H18V1H16V3H8V1H6V3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3M19 5V7H5V5H19M5 19V9H19V19H5Z","camera-outline":"M20,4H16.83L15,2H9L7.17,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M20,18H4V6H8.05L9.88,4H14.12L15.95,6H20V18M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15Z","chart-bar":"M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z","chat-processing-outline":"M12 3C6.5 3 2 6.58 2 11C2.05 13.15 3.06 15.17 4.75 16.5C4.75 17.1 4.33 18.67 2 21C4.37 20.89 6.64 20 8.47 18.5C9.61 18.83 10.81 19 12 19C17.5 19 22 15.42 22 11S17.5 3 12 3M12 17C7.58 17 4 14.31 4 11S7.58 5 12 5 20 7.69 20 11 16.42 17 12 17M17 12V10H15V12H17M13 12V10H11V12H13M9 12V10H7V12H9Z","check-circle-outline":"M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z","check":"M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z","chevron-right":"M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z","clock-outline":"M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z","close":"M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z","cloud-off-outline":"M19.8 22.6L17.15 20H6.5Q4.2 20 2.6 18.4T1 14.5Q1 12.58 2.19 11.08 3.38 9.57 5.25 9.15 5.33 8.95 5.4 8.76 5.5 8.57 5.55 8.35L1.4 4.2L2.8 2.8L21.2 21.2M6.5 18H15.15L7.1 9.95Q7.05 10.23 7.03 10.5 7 10.73 7 11H6.5Q5.05 11 4.03 12.03 3 13.05 3 14.5 3 15.95 4.03 17 5.05 18 6.5 18M11.13 14M21.6 18.75L20.15 17.35Q20.58 17 20.79 16.54 21 16.08 21 15.5 21 14.45 20.27 13.73 19.55 13 18.5 13H17V11Q17 8.93 15.54 7.46 14.08 6 12 6 11.33 6 10.7 6.16 10.07 6.33 9.5 6.68L8.05 5.23Q8.93 4.63 9.91 4.31 10.9 4 12 4 14.93 4 16.96 6.04 19 8.07 19 11 20.73 11.2 21.86 12.5 23 13.78 23 15.5 23 16.5 22.63 17.31 22.25 18.15 21.6 18.75M14.83 12.03Z","cog-outline":"M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10M10,22C9.75,22 9.54,21.82 9.5,21.58L9.13,18.93C8.5,18.68 7.96,18.34 7.44,17.94L4.95,18.95C4.73,19.03 4.46,18.95 4.34,18.73L2.34,15.27C2.21,15.05 2.27,14.78 2.46,14.63L4.57,12.97L4.5,12L4.57,11L2.46,9.37C2.27,9.22 2.21,8.95 2.34,8.73L4.34,5.27C4.46,5.05 4.73,4.96 4.95,5.05L7.44,6.05C7.96,5.66 8.5,5.32 9.13,5.07L9.5,2.42C9.54,2.18 9.75,2 10,2H14C14.25,2 14.46,2.18 14.5,2.42L14.87,5.07C15.5,5.32 16.04,5.66 16.56,6.05L19.05,5.05C19.27,4.96 19.54,5.05 19.66,5.27L21.66,8.73C21.79,8.95 21.73,9.22 21.54,9.37L19.43,11L19.5,12L19.43,13L21.54,14.63C21.73,14.78 21.79,15.05 21.66,15.27L19.66,18.73C19.54,18.95 19.27,19.04 19.05,18.95L16.56,17.95C16.04,18.34 15.5,18.68 14.87,18.93L14.5,21.58C14.46,21.82 14.25,22 14,22H10M11.25,4L10.88,6.61C9.68,6.86 8.62,7.5 7.85,8.39L5.44,7.35L4.69,8.65L6.8,10.2C6.4,11.37 6.4,12.64 6.8,13.8L4.68,15.36L5.43,16.66L7.86,15.62C8.63,16.5 9.68,17.14 10.87,17.38L11.24,20H12.76L13.13,17.39C14.32,17.14 15.37,16.5 16.14,15.62L18.57,16.66L19.32,15.36L17.2,13.81C17.6,12.64 17.6,11.37 17.2,10.2L19.31,8.65L18.56,7.35L16.15,8.39C15.38,7.5 14.32,6.86 13.12,6.62L12.75,4H11.25Z","content-copy":"M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z","creation":"M19,1L17.74,3.75L15,5L17.74,6.26L19,9L20.25,6.26L23,5L20.25,3.75M9,4L6.5,9.5L1,12L6.5,14.5L9,20L11.5,14.5L17,12L11.5,9.5M19,15L17.74,17.74L15,19L17.74,20.25L19,23L20.25,20.25L23,19L20.25,17.74","currency-eur":"M15 18.5C12.5 18.5 10.32 17.08 9.24 15H15L16 13H8.58C8.53 12.67 8.5 12.34 8.5 12S8.53 11.33 8.58 11H15L16 9H9.24C10.32 6.92 12.5 5.5 15 5.5C16.61 5.5 18.09 6.09 19.23 7.07L21 5.3C19.41 3.87 17.3 3 15 3C11.08 3 7.76 5.5 6.5 9H3L2 11H6.06C6 11.33 6 11.66 6 12S6 12.67 6.06 13H3L2 15H6.5C7.76 18.5 11.08 21 15 21C17.31 21 19.41 20.13 21 18.7L19.22 16.93C18.09 17.91 16.62 18.5 15 18.5Z","delete-outline":"M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19M8,9H16V19H8V9M15.5,4L14.5,3H9.5L8.5,4H5V6H19V4H15.5Z","email-outline":"M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6M20 6L12 11L4 6H20M20 18H4V8L12 13L20 8V18Z","eye-off-outline":"M2,5.27L3.28,4L20,20.72L18.73,22L15.65,18.92C14.5,19.3 13.28,19.5 12,19.5C7,19.5 2.73,16.39 1,12C1.69,10.24 2.79,8.69 4.19,7.46L2,5.27M12,9A3,3 0 0,1 15,12C15,12.35 14.94,12.69 14.83,13L11,9.17C11.31,9.06 11.65,9 12,9M12,4.5C17,4.5 21.27,7.61 23,12C22.18,14.08 20.79,15.88 19,17.19L17.58,15.76C18.94,14.82 20.06,13.54 20.82,12C19.17,8.64 15.76,6.5 12,6.5C10.91,6.5 9.84,6.68 8.84,7L7.3,5.47C8.74,4.85 10.33,4.5 12,4.5M3.18,12C4.83,15.36 8.24,17.5 12,17.5C12.69,17.5 13.37,17.43 14,17.29L11.72,15C10.29,14.85 9.15,13.71 9,12.28L5.6,8.87C4.61,9.72 3.78,10.78 3.18,12Z","eye-outline":"M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9M12,4.5C17,4.5 21.27,7.61 23,12C21.27,16.39 17,19.5 12,19.5C7,19.5 2.73,16.39 1,12C2.73,7.61 7,4.5 12,4.5M3.18,12C4.83,15.36 8.24,17.5 12,17.5C15.76,17.5 19.17,15.36 20.82,12C19.17,8.64 15.76,6.5 12,6.5C8.24,6.5 4.83,8.64 3.18,12Z","file-document-outline":"M6,2A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6M6,4H13V9H18V20H6V4M8,12V14H16V12H8M8,16V18H13V16H8Z","file-pdf-box":"M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3M9.5 11.5C9.5 12.3 8.8 13 8 13H7V15H5.5V9H8C8.8 9 9.5 9.7 9.5 10.5V11.5M14.5 13.5C14.5 14.3 13.8 15 13 15H10.5V9H13C13.8 9 14.5 9.7 14.5 10.5V13.5M18.5 10.5H17V11.5H18.5V13H17V15H15.5V9H18.5V10.5M12 10.5H13V13.5H12V10.5M7 10.5H8V11.5H7V10.5Z","file-upload-outline":"M14,2L20,8V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2H14M18,20V9H13V4H6V20H18M12,12L16,16H13.5V19H10.5V16H8L12,12Z","fingerprint":"M17.81,4.47C17.73,4.47 17.65,4.45 17.58,4.41C15.66,3.42 14,3 12,3C10.03,3 8.15,3.47 6.44,4.41C6.2,4.54 5.9,4.45 5.76,4.21C5.63,3.97 5.72,3.66 5.96,3.53C7.82,2.5 9.86,2 12,2C14.14,2 16,2.47 18.04,3.5C18.29,3.65 18.38,3.95 18.25,4.19C18.16,4.37 18,4.47 17.81,4.47M3.5,9.72C3.4,9.72 3.3,9.69 3.21,9.63C3,9.47 2.93,9.16 3.09,8.93C4.08,7.53 5.34,6.43 6.84,5.66C10,4.04 14,4.03 17.15,5.65C18.65,6.42 19.91,7.5 20.9,8.9C21.06,9.12 21,9.44 20.78,9.6C20.55,9.76 20.24,9.71 20.08,9.5C19.18,8.22 18.04,7.23 16.69,6.54C13.82,5.07 10.15,5.07 7.29,6.55C5.93,7.25 4.79,8.25 3.89,9.5C3.81,9.65 3.66,9.72 3.5,9.72M9.75,21.79C9.62,21.79 9.5,21.74 9.4,21.64C8.53,20.77 8.06,20.21 7.39,19C6.7,17.77 6.34,16.27 6.34,14.66C6.34,11.69 8.88,9.27 12,9.27C15.12,9.27 17.66,11.69 17.66,14.66A0.5,0.5 0 0,1 17.16,15.16A0.5,0.5 0 0,1 16.66,14.66C16.66,12.24 14.57,10.27 12,10.27C9.43,10.27 7.34,12.24 7.34,14.66C7.34,16.1 7.66,17.43 8.27,18.5C8.91,19.66 9.35,20.15 10.12,20.93C10.31,21.13 10.31,21.44 10.12,21.64C10,21.74 9.88,21.79 9.75,21.79M16.92,19.94C15.73,19.94 14.68,19.64 13.82,19.05C12.33,18.04 11.44,16.4 11.44,14.66A0.5,0.5 0 0,1 11.94,14.16A0.5,0.5 0 0,1 12.44,14.66C12.44,16.07 13.16,17.4 14.38,18.22C15.09,18.7 15.92,18.93 16.92,18.93C17.16,18.93 17.56,18.9 17.96,18.83C18.23,18.78 18.5,18.96 18.54,19.24C18.59,19.5 18.41,19.77 18.13,19.82C17.56,19.93 17.06,19.94 16.92,19.94M14.91,22C14.87,22 14.82,22 14.78,22C13.19,21.54 12.15,20.95 11.06,19.88C9.66,18.5 8.89,16.64 8.89,14.66C8.89,13.04 10.27,11.72 11.97,11.72C13.67,11.72 15.05,13.04 15.05,14.66C15.05,15.73 16,16.6 17.13,16.6C18.28,16.6 19.21,15.73 19.21,14.66C19.21,10.89 15.96,7.83 11.96,7.83C9.12,7.83 6.5,9.41 5.35,11.86C4.96,12.67 4.76,13.62 4.76,14.66C4.76,15.44 4.83,16.67 5.43,18.27C5.53,18.53 5.4,18.82 5.14,18.91C4.88,19 4.59,18.87 4.5,18.62C4,17.31 3.77,16 3.77,14.66C3.77,13.46 4,12.37 4.45,11.42C5.78,8.63 8.73,6.82 11.96,6.82C16.5,6.82 20.21,10.33 20.21,14.65C20.21,16.27 18.83,17.59 17.13,17.59C15.43,17.59 14.05,16.27 14.05,14.65C14.05,13.58 13.12,12.71 11.97,12.71C10.82,12.71 9.89,13.58 9.89,14.65C9.89,16.36 10.55,17.96 11.76,19.16C12.71,20.1 13.62,20.62 15.03,21C15.3,21.08 15.45,21.36 15.38,21.62C15.33,21.85 15.12,22 14.91,22Z","folder-open-outline":"M6.1,10L4,18V8H21A2,2 0 0,0 19,6H12L10,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H19C19.9,20 20.7,19.4 20.9,18.5L23.2,10H6.1M19,18H6L7.6,12H20.6L19,18Z","format-list-numbered":"M7,13V11H21V13H7M7,19V17H21V19H7M7,7V5H21V7H7M3,8V5H2V4H4V8H3M2,17V16H5V20H2V19H4V18.5H3V17.5H4V17H2M4.25,10A0.75,0.75 0 0,1 5,10.75C5,10.95 4.92,11.14 4.79,11.27L3.12,13H5V14H2V13.08L4,11H2V10H4.25Z","hand-back-left-outline":"M3 16C3 20.42 6.58 24 11 24C14.43 24 17.5 21.91 18.77 18.73L21.33 12.3C21.58 11.66 21.56 10.92 21.18 10.35C20.69 9.61 19.82 9.29 19 9.5L18.22 9.73C17.76 9.85 17.34 10.08 17 10.39V4.5C17 3.12 15.88 2 14.5 2C14.31 2 14.13 2 13.96 2.06C13.75 .89 12.73 0 11.5 0C10.44 0 9.54 .66 9.17 1.59C8.96 1.53 8.73 1.5 8.5 1.5C7.12 1.5 6 2.62 6 4V4.55C5.84 4.5 5.67 4.5 5.5 4.5C4.12 4.5 3 5.62 3 7V16M5 7C5 6.72 5.22 6.5 5.5 6.5S6 6.72 6 7V12H8V4C8 3.72 8.22 3.5 8.5 3.5S9 3.72 9 4V12H11V2.5C11 2.22 11.22 2 11.5 2S12 2.22 12 2.5V12H14V4.5C14 4.22 14.22 4 14.5 4S15 4.22 15 4.5V15H17L18 12.5C18.15 12.05 18.5 11.71 19 11.59L19.5 11.45L16.91 18C15.95 20.41 13.61 22 11 22C7.69 22 5 19.31 5 16V7Z","history":"M13.5,8H12V13L16.28,15.54L17,14.33L13.5,12.25V8M13,3A9,9 0 0,0 4,12H1L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3","image-outline":"M19,19H5V5H19M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M13.96,12.29L11.21,15.83L9.25,13.47L6.5,17H17.5L13.96,12.29Z","inbox-outline":"M19 3H5A2 2 0 0 0 3 5V19A2 2 0 0 0 5 21H19A2 2 0 0 0 21 19V5A2 2 0 0 0 19 3M5 19V17H8.13A4.13 4.13 0 0 0 9.4 19M19 19H14.6A4.13 4.13 0 0 0 15.87 17H19M19 15H14V16A2 2 0 0 1 10 16V15H5V5H19Z","information-outline":"M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z","link-variant":"M10.59,13.41C11,13.8 11,14.44 10.59,14.83C10.2,15.22 9.56,15.22 9.17,14.83C7.22,12.88 7.22,9.71 9.17,7.76V7.76L12.71,4.22C14.66,2.27 17.83,2.27 19.78,4.22C21.73,6.17 21.73,9.34 19.78,11.29L18.29,12.78C18.3,11.96 18.17,11.14 17.89,10.36L18.36,9.88C19.54,8.71 19.54,6.81 18.36,5.64C17.19,4.46 15.29,4.46 14.12,5.64L10.59,9.17C9.41,10.34 9.41,12.24 10.59,13.41M13.41,9.17C13.8,8.78 14.44,8.78 14.83,9.17C16.78,11.12 16.78,14.29 14.83,16.24V16.24L11.29,19.78C9.34,21.73 6.17,21.73 4.22,19.78C2.27,17.83 2.27,14.66 4.22,12.71L5.71,11.22C5.7,12.04 5.83,12.86 6.11,13.65L5.64,14.12C4.46,15.29 4.46,17.19 5.64,18.36C6.81,19.54 8.71,19.54 9.88,18.36L13.41,14.83C14.59,13.66 14.59,11.76 13.41,10.59C13,10.2 13,9.56 13.41,9.17Z","lock-outline":"M12,17C10.89,17 10,16.1 10,15C10,13.89 10.89,13 12,13A2,2 0 0,1 14,15A2,2 0 0,1 12,17M18,20V10H6V20H18M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V10C4,8.89 4.89,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z","logout":"M17 7L15.59 8.41L18.17 11H8V13H18.17L15.59 15.58L17 17L22 12M4 5H12V3H4C2.9 3 2 3.9 2 5V19C2 20.1 2.9 21 4 21H12V19H4V5Z","magnify":"M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z","office-building-outline":"M19 3V21H13V17.5H11V21H5V3H19M15 7H17V5H15V7M11 7H13V5H11V7M7 7H9V5H7V7M15 11H17V9H15V11M11 11H13V9H11V11M7 11H9V9H7V11M15 15H17V13H15V15M11 15H13V13H11V15M7 15H9V13H7V15M15 19H17V17H15V19M7 19H9V17H7V19M21 1H3V23H21V1Z","open-in-new":"M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z","package-variant-closed":"M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M12,4.15L10.11,5.22L16,8.61L17.96,7.5L12,4.15M6.04,7.5L12,10.85L13.96,9.75L8.08,6.35L6.04,7.5M5,15.91L11,19.29V12.58L5,9.21V15.91M19,15.91V9.21L13,12.58V19.29L19,15.91Z","paperclip":"M16.5,6V17.5A4,4 0 0,1 12.5,21.5A4,4 0 0,1 8.5,17.5V5A2.5,2.5 0 0,1 11,2.5A2.5,2.5 0 0,1 13.5,5V15.5A1,1 0 0,1 12.5,16.5A1,1 0 0,1 11.5,15.5V6H10V15.5A2.5,2.5 0 0,0 12.5,18A2.5,2.5 0 0,0 15,15.5V5A4,4 0 0,0 11,1A4,4 0 0,0 7,5V17.5A5.5,5.5 0 0,0 12.5,23A5.5,5.5 0 0,0 18,17.5V6H16.5Z","pencil-outline":"M14.06,9L15,9.94L5.92,19H5V18.08L14.06,9M17.66,3C17.41,3 17.15,3.1 16.96,3.29L15.13,5.12L18.88,8.87L20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18.17,3.09 17.92,3 17.66,3M14.06,6.19L3,17.25V21H6.75L17.81,9.94L14.06,6.19Z","phone-outline":"M20,15.5C18.8,15.5 17.5,15.3 16.4,14.9C16.3,14.9 16.2,14.9 16.1,14.9C15.8,14.9 15.6,15 15.4,15.2L13.2,17.4C10.4,15.9 8,13.6 6.6,10.8L8.8,8.6C9.1,8.3 9.2,7.9 9,7.6C8.7,6.5 8.5,5.2 8.5,4C8.5,3.5 8,3 7.5,3H4C3.5,3 3,3.5 3,4C3,13.4 10.6,21 20,21C20.5,21 21,20.5 21,20V16.5C21,16 20.5,15.5 20,15.5M5,5H6.5C6.6,5.9 6.8,6.8 7,7.6L5.8,8.8C5.4,7.6 5.1,6.3 5,5M19,19C17.7,18.9 16.4,18.6 15.2,18.2L16.4,17C17.2,17.2 18.1,17.4 19,17.4V19Z","pin-outline":"M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12M8.8,14L10,12.8V4H14V12.8L15.2,14H8.8Z","plus":"M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z","receipt-text-outline":"M19.5 3.5L18 2L16.5 3.5L15 2L13.5 3.5L12 2L10.5 3.5L9 2L7.5 3.5L6 2L4.5 3.5L3 2V22L4.5 20.5L6 22L7.5 20.5L9 22L10.5 20.5L12 22L13.5 20.5L15 22L16.5 20.5L18 22L19.5 20.5L21 22V2L19.5 3.5M19 19H5V5H19V19M6 15H18V17H6M6 11H18V13H6M6 7H18V9H6V7Z","refresh":"M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z","send":"M2,21L23,12L2,3V10L17,12L2,14V21Z","share-variant-outline":"M18 16.08C17.24 16.08 16.56 16.38 16.04 16.85L8.91 12.7C8.96 12.47 9 12.24 9 12S8.96 11.53 8.91 11.3L15.96 7.19C16.5 7.69 17.21 8 18 8C19.66 8 21 6.66 21 5S19.66 2 18 2 15 3.34 15 5C15 5.24 15.04 5.47 15.09 5.7L8.04 9.81C7.5 9.31 6.79 9 6 9C4.34 9 3 10.34 3 12S4.34 15 6 15C6.79 15 7.5 14.69 8.04 14.19L15.16 18.34C15.11 18.55 15.08 18.77 15.08 19C15.08 20.61 16.39 21.91 18 21.91S20.92 20.61 20.92 19C20.92 17.39 19.61 16.08 18 16.08M18 4C18.55 4 19 4.45 19 5S18.55 6 18 6 17 5.55 17 5 17.45 4 18 4M6 13C5.45 13 5 12.55 5 12S5.45 11 6 11 7 11.45 7 12 6.55 13 6 13M18 20C17.45 20 17 19.55 17 19S17.45 18 18 18 19 18.45 19 19 18.55 20 18 20Z","shield-lock-outline":"M21,11C21,16.55 17.16,21.74 12,23C6.84,21.74 3,16.55 3,11V5L12,1L21,5V11M12,21C15.75,20 19,15.54 19,11.22V6.3L12,3.18L5,6.3V11.22C5,15.54 8.25,20 12,21M14.8,11V9.5C14.8,8.1 13.4,7 12,7C10.6,7 9.2,8.1 9.2,9.5V11C8.6,11 8,11.6 8,12.2V15.7C8,16.4 8.6,17 9.2,17H14.7C15.4,17 16,16.4 16,15.8V12.3C16,11.6 15.4,11 14.8,11M13.5,11H10.5V9.5C10.5,8.7 11.2,8.2 12,8.2C12.8,8.2 13.5,8.7 13.5,9.5V11Z","square-edit-outline":"M5,3C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19H5V5H12V3H5M17.78,4C17.61,4 17.43,4.07 17.3,4.2L16.08,5.41L18.58,7.91L19.8,6.7C20.06,6.44 20.06,6 19.8,5.75L18.25,4.2C18.12,4.07 17.95,4 17.78,4M15.37,6.12L8,13.5V16H10.5L17.87,8.62L15.37,6.12Z","store-outline":"M18.36 9L18.96 12H5.04L5.64 9H18.36M20 4H4V6H20V4M20 7H4L3 12V14H4V20H14V14H18V20H20V14H21V12L20 7M6 18V14H12V18H6Z","swap-horizontal":"M21,9L17,5V8H10V10H17V13M7,11L3,15L7,19V16H14V14H7V11Z","text-box-search-outline":"M15.5,12C18,12 20,14 20,16.5C20,17.38 19.75,18.21 19.31,18.9L22.39,22L21,23.39L17.88,20.32C17.19,20.75 16.37,21 15.5,21C13,21 11,19 11,16.5C11,14 13,12 15.5,12M15.5,14A2.5,2.5 0 0,0 13,16.5A2.5,2.5 0 0,0 15.5,19A2.5,2.5 0 0,0 18,16.5A2.5,2.5 0 0,0 15.5,14M5,3H19C20.11,3 21,3.89 21,5V13.03C20.5,12.23 19.81,11.54 19,11V5H5V19H9.5C9.81,19.75 10.26,20.42 10.81,21H5C3.89,21 3,20.11 3,19V5C3,3.89 3.89,3 5,3M7,7H17V9H7V7M7,11H12.03C11.23,11.5 10.54,12.19 10,13H7V11M7,15H9.17C9.06,15.5 9,16 9,16.5V17H7V15Z","thumb-down-outline":"M19,15V3H23V15H19M15,3A2,2 0 0,1 17,5V15C17,15.55 16.78,16.05 16.41,16.41L9.83,23L8.77,21.94C8.5,21.67 8.33,21.3 8.33,20.88L8.36,20.57L9.31,16H3C1.89,16 1,15.1 1,14V12C1,11.74 1.05,11.5 1.14,11.27L4.16,4.22C4.46,3.5 5.17,3 6,3H15M15,5H5.97L3,12V14H11.78L10.65,19.32L15,14.97V5Z","thumb-up-outline":"M5,9V21H1V9H5M9,21A2,2 0 0,1 7,19V9C7,8.45 7.22,7.95 7.59,7.59L14.17,1L15.23,2.06C15.5,2.33 15.67,2.7 15.67,3.11L15.64,3.43L14.69,8H21C22.11,8 23,8.9 23,10V12C23,12.26 22.95,12.5 22.86,12.73L19.84,19.78C19.54,20.5 18.83,21 18,21H9M9,19H18.03L21,12V10H12.21L13.34,4.68L9,9.03V19Z"};

  function cx() { var o = []; for (var i = 0; i < arguments.length; i++) if (arguments[i]) o.push(arguments[i]); return o.join(' '); }

  /* Icon — MaterialCommunityIcons path data, 24 viewBox */
  function Icon(p) {
    var size = p.size || 24, d = ICONS[p.name];
    return h('svg', { className: cx('mc-icon', p.className), width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': p.label ? undefined : true, role: p.label ? 'img' : undefined, 'aria-label': p.label, style: p.color ? { color: p.color } : undefined },
      d ? h('path', { d: d }) : null);
  }

  function Spinner(p) { return h('span', { className: cx('mc-spinner', p && p.large && 'mc-spinner-lg'), role: 'progressbar', 'aria-label': (p && p.label) || 'Cargando' }); }

  /* Button */
  function Button(p) {
    var mode = p.mode || 'primary';
    return h('button', { type: p.type || 'button', className: cx('mc-btn', 'mc-btn-' + mode, p.block && 'mc-btn-block', p.pressed && 'is-pressed', p.className),
      disabled: p.disabled || p.loading, 'aria-busy': p.loading || undefined, onClick: p.onPress || p.onClick },
      p.loading ? h(Spinner, { label: p.children + ' — cargando' }) : (p.icon ? h(Icon, { name: p.icon, size: 18 }) : null),
      p.children);
  }

  /* TextField */
  function TextField(p) {
    var st = useState(false), focused = st[0], setFocused = st[1];
    var label = p.label + (p.maxLength != null && p.showCount !== false ? ' (' + String(p.value || '').length + '/' + p.maxLength + ')' : '');
    var Tag = p.multiline ? 'textarea' : 'input';
    var id = p.id || ('f-' + String(p.label).replace(/\W+/g, '-'));
    return h('div', { className: 'mc-field' },
      h('label', { htmlFor: id, className: cx('mc-field-box', p.multiline && 'is-multiline', (focused || p.focused) && !p.error && 'is-focused', p.error && 'is-error', p.disabled && 'is-disabled'), style: p.minHeight ? { minHeight: p.minHeight } : undefined },
        h('span', { className: 'mc-field-label' }, label),
        p.leftIcon ? h('span', { className: 'mc-field-trailing' }, h(Icon, { name: p.leftIcon })) : null,
        h(Tag, { id: id, className: 'mc-field-input', type: p.secure ? 'password' : (p.type || 'text'), value: p.value, placeholder: p.placeholder, disabled: p.disabled, readOnly: p.readOnly || !p.onChange,
          maxLength: p.maxLength, rows: p.multiline ? (p.rows || 4) : undefined, 'aria-invalid': p.error ? true : undefined, 'aria-describedby': p.error ? id + '-err' : undefined,
          onFocus: function () { setFocused(true); }, onBlur: function () { setFocused(false); }, onChange: p.onChange ? function (e) { p.onChange(e.target.value); } : undefined }),
        p.right ? h('span', { className: 'mc-field-trailing' }, p.right) : null,
        p.secure ? h('span', { className: 'mc-field-trailing' }, h(Icon, { name: 'eye-outline', label: 'Mostrar contraseña' })) : null),
      p.error ? h('div', { id: id + '-err', className: 'mc-field-error', role: 'alert' }, h(Icon, { name: 'alert-circle-outline', size: 18 }), p.error)
        : (p.help ? h('div', { className: 'mc-field-help' }, p.help) : null));
  }

  /* DateField / DayField */
  function DateField(p) {
    if (p.optional && !p.value) {
      return h('div', { className: 'mc-field' }, h('div', { className: 'mc-fieldgroup-label' }, p.label),
        h('div', { className: 'mc-datefield-actions' }, h(Button, { mode: 'secondary', icon: 'plus' }, 'Añadir')));
    }
    return h('div', { className: 'mc-stack', style: { gap: 4 } },
      h(TextField, { label: p.label, value: p.value || '', error: p.error, help: p.help, disabled: p.disabled, showCount: false,
        right: h(Icon, { name: p.mode === 'day' ? 'calendar-outline' : 'calendar-edit-outline' }) }),
      p.optional ? h('div', null, h(Button, { mode: 'text', icon: 'close' }, 'Quitar')) : null);
  }

  function FieldGroup(p) {
    return h('div', { className: cx('mc-fieldgroup', p.error && 'is-error'), role: 'group', 'aria-label': p.label },
      p.label ? h('div', { className: 'mc-fieldgroup-label' }, p.label) : null,
      h('div', { className: 'mc-fieldgroup-body' }, p.children),
      p.error ? h('div', { className: 'mc-field-error', role: 'alert', style: { paddingLeft: 0 } }, h(Icon, { name: 'alert-circle-outline', size: 18 }), p.error) : null);
  }

  function FormSummary(p) {
    if (p.visible === false) return null;
    return h('div', { className: 'mc-formsummary', role: 'alert' }, h(Icon, { name: 'alert-circle-outline', size: 20 }), p.children || 'Revisa los campos marcados en rojo.');
  }

  /* Badge — tones neutral | info | warning | danger; quiet = text only */
  function Badge(p) {
    return h('span', { className: cx('mc-badge', 'mc-badge-' + (p.tone || 'neutral'), p.quiet && 'mc-badge-quiet') }, p.icon ? h(Icon, { name: p.icon }) : null, p.children);
  }
  function CountBadge(p) {
    if (!p.count) return null;
    return h('span', { className: 'mc-countbadge', 'aria-hidden': true }, p.count > 99 ? '99+' : p.count);
  }

  function Chip(p) {
    return h('button', { type: 'button', className: cx('mc-chip', p.selected && 'is-selected'), 'aria-pressed': !!p.selected, disabled: p.disabled, onClick: p.onPress },
      p.selected ? h(Icon, { name: 'check', size: 18 }) : (p.icon ? h(Icon, { name: p.icon, size: 18 }) : null), p.children);
  }
  function Chips(p) { return h('div', { className: 'mc-chips', role: p.single ? 'radiogroup' : 'group', 'aria-label': p.label }, p.children); }

  function SegmentedButtons(p) {
    return h('div', { className: 'mc-seg', role: 'radiogroup', 'aria-label': p.label },
      p.buttons.map(function (b) {
        var sel = b.value === p.value;
        return h('button', { key: b.value, type: 'button', role: 'radio', 'aria-checked': sel, className: sel ? 'is-selected' : undefined, onClick: p.onChange ? function () { p.onChange(b.value); } : undefined },
          sel ? h(Icon, { name: 'check', size: 18 }) : null, b.label);
      }));
  }

  function Checkbox(p) {
    return h('label', { className: cx('mc-check', p.checked && 'is-on', p.disabled && 'is-disabled') },
      h('span', { className: 'mc-check-box', role: 'checkbox', 'aria-checked': !!p.checked }, p.checked ? h(Icon, { name: 'check', size: 16 }) : null), p.label);
  }
  function Switch(p) {
    return h('label', { className: cx('mc-switch-row', p.disabled && 'is-disabled') },
      h('span', { className: 'mc-switch-text' }, h('span', { className: 'mc-switch-label' }, p.label), p.help ? h('span', { className: 'mc-switch-help' }, p.help) : null),
      h('span', { className: cx('mc-switch', p.value && 'is-on'), role: 'switch', 'aria-checked': !!p.value, 'aria-label': p.label }));
  }

  /* Header + HeaderAction */
  function HeaderAction(p) {
    return h('button', { type: 'button', className: cx('mc-hdr-action', p.pressed && 'is-pressed'), 'aria-label': p.label + (p.count ? ', ' + p.count : ''), title: p.label, disabled: p.disabled, onClick: p.onPress },
      h(Icon, { name: p.icon }), p.count ? h(CountBadge, { count: p.count }) : null, p.showTooltip ? h('span', { className: 'mc-tooltip', role: 'tooltip' }, p.label) : null);
  }
  function Header(p) {
    return h('header', { className: cx('mc-header', !p.back && 'no-back', p.scrolled && 'is-scrolled') },
      p.back ? h(HeaderAction, { icon: 'arrow-left', label: 'Volver' }) : null,
      h('h1', { className: 'mc-header-title' }, p.title),
      (p.actions || []).slice(0, 2).map(function (a, i) { return h(HeaderAction, Object.assign({ key: i }, a)); }));
  }

  /* Screen / Loading / ErrorState / EmptyState / Skeleton */
  function Screen(p) { return h('main', { className: 'mc-screen', style: p.style }, p.children); }
  function Loading(p) { return h('div', { className: 'mc-state', 'aria-live': 'polite' }, h(Spinner, { large: true, label: (p && p.label) || 'Cargando' })); }
  function ErrorState(p) {
    return h('div', { className: 'mc-state is-error' }, h(Icon, { name: p.icon || 'cloud-off-outline', size: 48, className: 'mc-state-icon' }),
      h('p', { className: 'mc-state-text', role: 'alert' }, p.message || 'Ha ocurrido un error. Inténtalo de nuevo.'),
      p.onRetry !== false ? h(Button, { mode: 'secondary', icon: 'refresh' }, 'Reintentar') : null);
  }
  function EmptyState(p) {
    return h('div', { className: 'mc-state' }, h(Icon, { name: p.icon || 'inbox-outline', size: 48, className: 'mc-state-icon' }),
      p.title ? h('p', { className: 'mc-state-title' }, p.title) : null, h('p', { className: 'mc-state-text' }, p.message), p.action || null);
  }
  function Skeleton(p) {
    var lines = p.variant === 'detail' ? [['60%', 28], ['35%', 16], ['100%', 16], ['92%', 16], ['80%', 16]] : null;
    if (lines) return h('div', { className: 'mc-stack', 'aria-busy': true, 'aria-label': 'Cargando' }, lines.map(function (l, i) { return h('div', { key: i, className: 'mc-skel', style: { width: l[0], height: l[1] } }); }));
    var n = p.rows || 3, rows = [];
    for (var i = 0; i < n; i++) rows.push(h('div', { key: i, className: 'mc-card' }, h('div', { className: 'mc-skel', style: { width: '70%', height: 20 } }), h('div', { className: 'mc-skel', style: { width: '45%', height: 14 } })));
    return h('div', { className: 'mc-col', 'aria-busy': true, 'aria-label': 'Cargando' }, rows);
  }
  function ListFooter(p) { return h('div', { className: 'mc-list-footer' }, h(Spinner, { label: 'Cargando más' })); }

  /* AppLogo — placeholder monogram until the real mark is supplied */
  function AppLogo() {
    return h('div', { className: 'mc-applogo' },
      h('div', { className: 'mc-applogo-mark', 'aria-hidden': true }, h(Icon, { name: 'account-group-outline', size: 44 })),
      h('div', { className: 'mc-applogo-name' }, 'multi', h('b', null, 'Cooperativa')));
  }

  /* Money — Spanish format */
  function formatMoney(n) {
    var neg = n < 0, a = Math.abs(n).toFixed(2).split('.'), i = a[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '−' : '') + i + ',' + a[1] + ' €';
  }
  function Money(p) {
    var neg = p.value < 0, txt = formatMoney(p.value);
    if (p.signed && p.value > 0) txt = '+' + txt;
    return h('span', { className: cx('mc-money', neg && 'is-negative'), style: p.style }, txt);
  }

  /* Card / ListRow */
  function Card(p) {
    return h(p.onPress ? 'button' : 'div', { className: cx('mc-card', p.onPress && 'is-pressable', p.pressed && 'is-pressed', p.selected && 'is-selected'), style: Object.assign(p.onPress ? { font: 'inherit', textAlign: 'left', color: 'inherit', width: '100%' } : {}, p.style), onClick: p.onPress }, p.children);
  }
  function ListRow(p) {
    return h(Card, { onPress: p.onPress || function () {}, pressed: p.pressed },
      h('div', { className: 'mc-row-head' },
        p.unread ? h('span', { className: 'mc-unread-dot', role: 'img', 'aria-label': 'Sin leer' }) : null,
        h('p', { className: cx('mc-row-title', p.unread && 'is-unread') }, p.title),
        p.amount != null ? h('span', { className: 'mc-row-amount' }, typeof p.amount === 'number' ? h(Money, { value: p.amount }) : p.amount) : null,
        p.status || null),
      p.badges && p.badges.length ? h('div', { className: 'mc-row-badges' }, p.badges) : null,
      p.meta ? h('p', { className: 'mc-row-meta' }, p.meta) : null,
      p.alert ? h('div', { className: 'mc-row-alert is-' + (p.alert.tone || 'danger') }, h(Icon, { name: p.alert.tone === 'warning' ? 'clock-outline' : 'alert-circle-outline', size: 18 }), p.alert.text) : null);
  }
  function SectionTitle(p) { return h('h2', { className: 'mc-section-title' }, p.children); }

  /* Banner + AiNotice */
  function Banner(p) {
    var tone = p.tone || 'warning', icon = p.icon || (tone === 'danger' ? 'alert-circle-outline' : tone === 'info' ? 'information-outline' : 'alert-outline');
    return h('div', { className: 'mc-banner mc-banner-' + tone, role: tone === 'danger' ? 'alert' : 'status' }, h(Icon, { name: icon, size: 20 }),
      h('div', { className: 'mc-banner-body' }, h('span', null, p.children), p.action ? h('span', { className: 'mc-banner-action' }, p.action) : null));
  }
  function AiNotice(p) {
    var kinds = { privacy: ['shield-lock-outline', 'Privacidad'], proposal: ['creation', 'Propuesta de la IA'], info: ['information-outline', 'Asistente IA'] };
    var k = kinds[p.kind || 'proposal'];
    return h('aside', { className: 'mc-ai', 'aria-label': k[1] }, h(Icon, { name: k[0], size: 20 }),
      h('div', { className: 'mc-ai-body' }, h('span', { className: 'mc-ai-kind' }, k[1]), p.title ? h('span', { className: 'mc-ai-title' }, p.title) : null,
        h('span', { className: p.title ? 'mc-ai-text' : undefined }, p.children)));
  }

  /* HomeTile + AttentionItem */
  function HomeTile(p) {
    var label = p.title + (p.count ? ', ' + p.count + ' ' + (p.countLabel || '') : '');
    return h('button', { type: 'button', className: cx('mc-tile', p.pressed && 'is-pressed'), 'aria-label': label.trim(), onClick: p.onPress },
      h(Icon, { name: p.icon, size: 40 }), h('span', { className: 'mc-tile-title' }, p.title), h(CountBadge, { count: p.count }));
  }
  function AttentionItem(p) {
    return h('div', { className: 'mc-attn', role: 'button', tabIndex: 0 }, h(Icon, { name: p.icon }),
      h('span', { className: 'mc-attn-text' }, h('span', { className: 'mc-attn-title' }, p.title), p.meta ? h('span', { className: 'mc-attn-meta' }, p.meta) : null),
      p.badge || null, h(Icon, { name: 'chevron-right' }));
  }

  /* ProgressBar + VoteTally + VoteOption */
  function ProgressBar(p) {
    var pct = p.total ? Math.round(100 * p.value / p.total) : 0;
    return h('div', { className: 'mc-progress' },
      h('div', { className: 'mc-progress-label' }, h('span', null, p.label), h('span', { style: { fontWeight: 500 } }, p.value + ' de ' + p.total + ' (' + pct + ' %)')),
      h('div', { className: 'mc-progress-track', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': p.label },
        h('div', { className: 'mc-progress-fill', style: { width: pct + '%' } }),
        p.quorum ? h('span', { className: 'mc-progress-mark', title: 'Quórum', style: { left: p.quorum + '%' } }) : null));
  }
  function VoteTally(p) {
    var t = (p.favor + p.contra + p.abst) || 1;
    function row(label, n, cls) { return h('div', { className: 'mc-tally-row' }, h('span', null, label), h('span', { className: 'mc-tally-bar' }, h('span', { className: cls, style: { width: (100 * n / t) + '%' } })), h('span', { className: 'mc-tally-n' }, n)); }
    return h('div', { className: 'mc-tally', role: 'table', 'aria-label': 'Resultado' }, row('A favor', p.favor, 'mc-tally-for'), row('En contra', p.contra, 'mc-tally-against'), row('Abstenciones', p.abst, 'mc-tally-abst'));
  }
  function VoteOption(p) {
    return h('button', { type: 'button', role: 'radio', 'aria-checked': !!p.selected, className: cx('mc-vote', p.selected && 'is-selected'), disabled: p.disabled, onClick: p.onPress },
      h('span', { className: 'mc-vote-radio' }), p.children);
  }

  /* Chat */
  function ChatBubble(p) {
    return h('div', { className: cx('mc-bubble', 'mc-bubble-' + (p.role || 'assistant'), p.pending && 'is-pending') }, p.children);
  }
  function Thinking() { return h('div', { className: 'mc-thinking', role: 'status' }, h('i'), h('i'), h('i'), 'Pensando…'); }
  function SourceCard(p) {
    return h('button', { type: 'button', className: 'mc-source', onClick: p.onPress },
      p.n ? h('span', { className: 'mc-source-num', 'aria-hidden': true }, p.n) : null,
      h('span', { className: 'mc-source-body' }, h('span', { className: 'mc-source-title' }, p.title), p.excerpt ? h('span', { className: 'mc-source-excerpt' }, p.excerpt) : null),
      h(Icon, { name: p.icon || 'file-document-outline', size: 20 }));
  }
  function Sources(p) {
    return h('div', { className: 'mc-sources' }, h('div', { className: 'mc-sources-title' }, h(Icon, { name: 'text-box-search-outline', size: 18 }), 'Fuentes'), p.children);
  }
  function Composer(p) {
    var empty = !p.value;
    return h('div', { className: 'mc-composer' },
      h('textarea', { className: 'mc-composer-input', rows: p.value && p.value.length > 30 ? 2 : 1, maxLength: 2000, placeholder: 'Escribe tu pregunta', 'aria-label': 'Mensaje', value: p.value || '', readOnly: true }),
      h('button', { type: 'button', className: 'mc-send', disabled: empty || p.disabled, 'aria-label': 'Enviar' }, h(Icon, { name: 'send' })));
  }

  /* HeroCard + SummaryCard + ActionBar */
  function HeroCard(p) {
    return h('section', { className: 'mc-hero' }, h('span', { className: 'mc-hero-label' }, p.label), h('span', { className: 'mc-hero-amount' }, formatMoney(p.amount)), p.meta ? h('span', { className: 'mc-hero-meta' }, p.meta) : null);
  }
  function SummaryCard(p) {
    return h('section', { className: 'mc-summary' }, h('span', { className: 'mc-summary-label' }, p.label), h('span', { className: 'mc-summary-amount' }, formatMoney(p.amount)),
      h('span', { className: 'mc-summary-meta' }, p.meta), p.overdue ? h('span', { className: 'mc-summary-alert' }, p.overdue) : null);
  }
  function ActionBar(p) { return h('div', { className: 'mc-actionbar' }, p.children); }

  window.MultiCooperativa = {
    Icon: Icon, Spinner: Spinner, Button: Button, TextField: TextField, DateField: DateField, FieldGroup: FieldGroup, FormSummary: FormSummary,
    Badge: Badge, CountBadge: CountBadge, Chip: Chip, Chips: Chips, SegmentedButtons: SegmentedButtons, Checkbox: Checkbox, Switch: Switch,
    HeaderAction: HeaderAction, Header: Header, Screen: Screen, Loading: Loading, ErrorState: ErrorState, EmptyState: EmptyState, Skeleton: Skeleton, ListFooter: ListFooter,
    AppLogo: AppLogo, Money: Money, formatMoney: formatMoney, Card: Card, ListRow: ListRow, SectionTitle: SectionTitle, Banner: Banner, AiNotice: AiNotice,
    HomeTile: HomeTile, AttentionItem: AttentionItem, ProgressBar: ProgressBar, VoteTally: VoteTally, VoteOption: VoteOption,
    ChatBubble: ChatBubble, Thinking: Thinking, SourceCard: SourceCard, Sources: Sources, Composer: Composer, HeroCard: HeroCard, SummaryCard: SummaryCard, ActionBar: ActionBar,
    icons: Object.keys(ICONS)
  };
})();
(function () {
  var React = window.React, h = React.createElement, E = window.MultiCooperativa;
  function Frames(p) { return h('div', { className: 'mc-frames' }, p.children); }
  function Phone(p) {
    return h('div', { className: 'mc-frame' },
      p.label ? h('div', { className: 'mc-frame-label' }, p.label) : null,
      h('div', { className: 'mc-device' + (p.bar ? ' has-bar' : ''), 'data-theme': p.theme || 'green', style: p.height ? { minHeight: p.height } : undefined },
        h('div', { className: 'mc-device-status' }),
        p.title != null ? h(E.Header, { title: p.title, back: p.back !== false, actions: p.actions, scrolled: p.scrolled }) : null,
        h('div', { className: 'mc-device-body' + (p.list ? ' is-list' : ''), style: p.bodyStyle }, p.children),
        p.bar ? h('div', { className: 'mc-device-bar' }, h(E.ActionBar, null, p.bar)) : null));
  }
  function ListItem(p) {
    return h('div', { className: 'mc-li' + (p.danger ? ' is-danger' : ''), role: p.onPress ? 'button' : undefined },
      p.icon ? h(E.Icon, { name: p.icon }) : null,
      h('div', { className: 'mc-li-text' }, h('span', { className: 'mc-li-title' }, p.title), p.meta ? h('span', { className: 'mc-li-meta' }, p.meta) : null),
      p.right !== undefined ? h('div', { className: 'mc-li-trail' }, p.right) : h('div', { className: 'mc-li-trail' }, h(E.Icon, { name: 'chevron-right' })));
  }
  function Group(p) { return h('div', { className: 'mc-group' }, p.children); }
  function LinkCard(p) {
    return h('div', { className: 'mc-linkcard' }, h('span', { className: 'mc-li-meta' }, p.label || 'Enlace de invitación'),
      h('span', { className: 'mc-linkcard-url' }, p.url), p.meta ? h('span', { className: 'mc-fine' }, p.meta) : null,
      h('div', { className: 'mc-row', style: { gap: 8 } }, h(E.Button, { mode: 'secondary', icon: 'content-copy' }, 'Copiar enlace'), h(E.Button, { mode: 'secondary', icon: 'share-variant-outline' }, 'Compartir')));
  }
  Object.assign(window.MultiCooperativa, { Frames: Frames, Phone: Phone, ListItem: ListItem, Group: Group, LinkCard: LinkCard });
})();
(function () {
  var React = window.React, h = React.createElement, E = window.MultiCooperativa;
  /* MapCard — static location preview; tapping opens the native maps app */
  function MapCard(p) {
    return h('div', { className: 'mc-map' },
      h('button', { type: 'button', className: 'mc-map-art', 'aria-label': 'Ver ' + p.place + ' en el mapa', onClick: p.onPress },
        h('svg', { viewBox: '0 0 342 140', width: '100%', height: 140, preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': true },
          h('rect', { className: 'mc-map-ground', x: 0, y: 0, width: 342, height: 140 }),
          h('rect', { className: 'mc-map-block', x: 12, y: 10, width: 96, height: 46, rx: 4 }),
          h('rect', { className: 'mc-map-block', x: 124, y: 10, width: 70, height: 46, rx: 4 }),
          h('rect', { className: 'mc-map-park', x: 210, y: 10, width: 120, height: 46, rx: 4 }),
          h('rect', { className: 'mc-map-block', x: 12, y: 74, width: 60, height: 56, rx: 4 }),
          h('rect', { className: 'mc-map-block', x: 88, y: 74, width: 106, height: 56, rx: 4 }),
          h('rect', { className: 'mc-map-block', x: 210, y: 74, width: 52, height: 56, rx: 4 }),
          h('rect', { className: 'mc-map-block', x: 278, y: 74, width: 52, height: 56, rx: 4 }),
          h('path', { className: 'mc-map-road', d: 'M0 65 H342 M116 0 V140 M202 0 V140' }),
          h('path', { className: 'mc-map-road-sm', d: 'M80 65 V140 M270 65 V140' })),
        h('span', { className: 'mc-map-pin' }, h(E.Icon, { name: 'map-marker', size: 36 }))),
      h('div', { className: 'mc-map-foot' },
        h('div', { className: 'mc-li-text' }, h('span', { className: 'mc-li-title' }, p.place), p.address ? h('span', { className: 'mc-li-meta' }, p.address) : null),
        h(E.Button, { mode: 'text', icon: 'directions' }, 'Cómo llegar')));
  }
  Object.assign(window.MultiCooperativa, { MapCard: MapCard });
})();
