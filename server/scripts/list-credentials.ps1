# Lists git entries in Windows Credential Manager (target + username only, never secrets).
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class GitUserCredList {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct CREDENTIAL {
    public int Flags;
    public int Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize;
    public IntPtr CredentialBlob;
    public int Persist;
    public int AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredEnumerate(string filter, int flags, out int count, out IntPtr credentials);

  [DllImport("advapi32.dll")]
  static extern void CredFree(IntPtr buffer);

  public static string[][] List(string filter) {
    int count;
    IntPtr list;
    var result = new List<string[]>();
    if (!CredEnumerate(filter, 0, out count, out list)) return result.ToArray();
    try {
      for (int i = 0; i < count; i++) {
        IntPtr item = Marshal.ReadIntPtr(list, i * IntPtr.Size);
        var cred = (CREDENTIAL)Marshal.PtrToStructure(item, typeof(CREDENTIAL));
        result.Add(new[] { cred.TargetName, cred.UserName ?? "" });
      }
    } finally {
      CredFree(list);
    }
    return result.ToArray();
  }
}
"@

$items = @([GitUserCredList]::List('git:*') | ForEach-Object { [pscustomobject]@{ target = $_[0]; username = $_[1] } })
[Console]::Out.Write((ConvertTo-Json -InputObject $items -Compress))
