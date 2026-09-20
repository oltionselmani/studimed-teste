; NSIS customisation for the ExamOS installer wizard.
; Keeps the student's data when the app is uninstalled — an uninstall should
; not silently destroy their exam history.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Also delete your ExamOS data (exams, uploaded material, test results)?$\r$\n$\r$\nChoose No to keep it for a future reinstall." \
      /SD IDNO IDNO keepData
      RMDir /r "$APPDATA\ExamOS"
    keepData:
  ${endIf}
!macroend
