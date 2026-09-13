# Runs when Windows opens an agents-dashboard: link, which is what a clicked
# notification does.
#
# Any web page can offer such a link too, and a link is only text: one written
# to look like extra switches (-DebugPort, -DataDir ...) must not become them.
# So this script has no parameters of its own, and hands the launcher nothing
# but a notification id it has checked.

$link = $args -join ' '
$id = if ($link -match 'notification=([A-Za-z0-9-]{1,64})') { $Matches[1] } else { '' }
$open = if ($id) { "agents-dashboard:open?notification=$id" } else { '' }

& (Join-Path $PSScriptRoot 'launch.ps1') -Open $open
