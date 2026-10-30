RHYTHM KITCHEN UI58 — SCENE SCRIPT REFERENCE FIX (2026-10-30)
==========================================================

SUA 2 CANH BAO
- GameObject (named 'RK58_Multitouch') references runtime script in scene file. Fixing!
- GameObject (named 'RK58_SongBank') references runtime script in scene file. Fixing!

NGUYEN NHAN
- Goi UI58 cu de RK58TimerView, RK58EnableMultitouch va RK58SongBank
  trong cung file RK58Runtime.cs.
- Unity can moi MonoBehaviour gan vao Scene co file C# cung ten class
  de nhan dien m_Script dung va luu tham chieu on dinh.
- Goi moi da tach cac component. RK58Runtime.cs chi chua DATA (khong MonoBehaviour).

CAI DAT AN TOAN
1) Sao luu project va file Assets/_Project/Scenes/04_Gameplay.unity.
2) Thoat Play Mode, dong Scene 04_Gameplay neu dang mo.
3) Giai nen ZIP vao project root (noi co Assets/ va Packages/),
   CHO PHEP GHI DE RK58Runtime.cs, RK58SceneFixEditor.cs va RK58MidiImporter.cs.
   KHONG GIU LAI BAN RK58Runtime.cs CU. Ban moi la DATA-only.
4) Mo Unity, de compile xong (Console khong co ERROR C#).
5) Mo 04_Gameplay.
6) Tools > Rhythm Kitchen > UI58 - Timer + 2 Fingers
   > 00 - Repair UI58 Scene References
   => Tao lai RK58_Multitouch va RK58_SongBank voi dung MonoBehaviour.
   => Neu du lieu SongBank cu doc duoc se giu lai.
7) Chay 01 - Fix Timer + Enable Two Fingers de gan lai timer.
8) Neu SongBank trong Inspector bi trong, chay:
   03 - Import Full + MIDI Pairs
   Can cac file audio Full va MIDI tren Assets co ten goc trung nhau.
9) Ctrl+S, dong Scene va mo lai. Xem Console da het hai canh bao.
10) Test tren thiet bi cam ung. Goi nay khong thay doi NoteController hay scoring.

DANH SACH FILE:
Assets/_Project/Scripts/Rhythm/RK58Runtime.cs (data classes only)
Assets/_Project/Scripts/Rhythm/RK58TimerView.cs
Assets/_Project/Scripts/Rhythm/RK58EnableMultitouch.cs
Assets/_Project/Scripts/Rhythm/RK58SongBank.cs
Assets/_Project/Editor/RK58SceneFixEditor.cs
Assets/_Project/Editor/RK58MidiImporter.cs
Assets/_Project/Editor/RK58SceneReferenceRepair.cs

GHI CHU
- Goi chi sua code va them menu Editor, khong chua Scene da sua san.
- Chay 00 moi thuc su sua tham chieu cu trong Scene hien tai.
- MIDI importer chi tao JSON note data, chua tu dong noi vao NoteSpawner.
- EventSystem xu ly hai touch ID rieng. HOLD + TAP van phu thuoc
  input-state cua RhythmKeyboardTest. Khong gia lap touch thu hai de tranh
  cham diem trung lap.
- Chua the Play-test tren Unity 6 trong moi truong nay.
