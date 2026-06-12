Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Select-Object ProcessId, ParentProcessId, CreationDate, CommandLine | Format-Table -Wrap
