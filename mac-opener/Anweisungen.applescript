-- Anweisungen document opener (v1.66)
-- Receives .beak from Finder, stages via serve, opens Dock Safari Web App (localhost) with ?pending=1
property openerScript : "/Users/dk/Anweisungen-serve/open-beak.sh"

on open theFiles
  set paths to {}
  repeat with f in theFiles
    set end of paths to POSIX path of f
  end repeat
  my runOpener(paths)
end open

on run
  -- launched without document → just open the Dock Web App UI
  try
    do shell script "/bin/bash " & quoted form of openerScript
  on error errMsg number errNum
    display alert "Anweisungen" message "Serve/Opener-Fehler: " & errMsg buttons {"OK"} default button 1
  end try
end run

on runOpener(paths)
  set cmd to "/bin/bash " & quoted form of openerScript
  repeat with p in paths
    set cmd to cmd & " " & quoted form of p
  end repeat
  try
    do shell script cmd
  on error errMsg number errNum
    display alert "Anweisungen" message "Konnte .beak nicht öffnen: " & errMsg buttons {"OK"} default button 1
  end try
end runOpener
