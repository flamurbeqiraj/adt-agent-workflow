param(
  [ValidateSet('read','write','delete')][string]$Mode,
  [string]$Path
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

switch ($Mode) {
  'read' {
    if ([IO.File]::Exists($Path)) {
      $protected = [IO.File]::ReadAllBytes($Path)
      $plain = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
      try { [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain)) }
      finally { [Array]::Clear($plain, 0, $plain.Length) }
    }
  }
  'write' {
    $key = [Console]::In.ReadToEnd()
    $plain = [Text.Encoding]::UTF8.GetBytes($key)
    try {
      $protected = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
      [IO.File]::WriteAllBytes($Path, $protected)
    }
    finally { [Array]::Clear($plain, 0, $plain.Length) }
  }
  'delete' {
    if ([IO.File]::Exists($Path)) { [IO.File]::Delete($Path) }
  }
}
