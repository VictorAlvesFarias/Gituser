# Encrypts/decrypts base64 data from stdin with Windows DPAPI (current user scope).
param([Parameter(Mandatory)][ValidateSet('protect', 'unprotect')][string]$Mode)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

$data = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
$result = if ($Mode -eq 'protect') {
  [System.Security.Cryptography.ProtectedData]::Protect($data, $null, $scope)
} else {
  [System.Security.Cryptography.ProtectedData]::Unprotect($data, $null, $scope)
}
[Console]::Out.Write([Convert]::ToBase64String($result))
