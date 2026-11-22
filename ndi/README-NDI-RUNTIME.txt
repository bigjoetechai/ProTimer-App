ProTimer Native NDI® Broadcast Runtime Guide
============================================

To make ProTimer's NDI video stream ("DESKTOP-PC (ProTimer (Main Output))") visible
to OBS Studio, vMix, ProPresenter, NDI Studio Monitor, Wirecast, and Resolume on your
local network:

Option 1 (Recommended): Install the Free Official NDI® Runtime or NDI Tools on Windows
--------------------------------------------------------------------------------------
1. Download and install the official NDI 6 Runtime for Windows:
   http://ndi.link/NDIRedistV6
   (Or install full NDI Tools from https://ndi.video/tools/)
2. ProTimer automatically detects `Processing.NDI.Lib.x64.dll` from:
   - `%NDI_RUNTIME_DIR_V6%\Processing.NDI.Lib.x64.dll`
   - `%NDI_RUNTIME_DIR_V5%\Processing.NDI.Lib.x64.dll`
   - `C:\Program Files\NDI\NDI 6 Runtime\v6\Processing.NDI.Lib.x64.dll`
   - `C:\Program Files\NDI\NDI 5 Runtime\v5\Processing.NDI.Lib.x64.dll`

Option 2 (Portable): Place `Processing.NDI.Lib.x64.dll` in this `ndi/` folder
-----------------------------------------------------------------------------
You can also copy `Processing.NDI.Lib.x64.dll` directly into this `ndi/` directory,
and ProTimer will load it automatically without requiring a system-wide installer.

Windows Firewall Note:
----------------------
Make sure your Windows network profile is set to "Private Network" and allow ProTimer
(and UDP Port 5353 mDNS + TCP Ports 5960-5970 NDI) through Windows Defender Firewall.
