RHYTHM KITCHEN UI58 — SONG BANK SCRIPT REFERENCE FIX
======================================================
HOTFIX 2026-10-30

VAN DE:
[RK58 SongBank] Unable to attach the expected RK58SongBank.cs.
... RK58SongBankDeepRepair.cs:140

NGUYEN NHAN:
Ban cu xoa component truoc, Undo.AddComponent<RK58SongBank> sau,
roi so sanh MonoScript.FromMonoBehaviour(rebuilt) voi MonoScript asset.
Neu hai reference khong trung, ban cu bao loi va bo do, co nguy co
mat song list chua Save.

FIX:
- Khong con dung so sanh MonoScript.FromMonoBehaviour don le lam ket luan.
- Kiem tra m_Script trong SerializedObject cua component tren GameObject.
- Neu khac file RK58SongBank.cs, thu bind lai reference bang SerializedProperty.
- Chi xoa legacy RK58Runtime va missing-script sau khi component duoc verify.
- Giu AudioSource + song list con co the doc duoc.
- Khong tao SongBank moi neu GameObject cua ban da co.
- Tao ban sao luu Scene truoc khi can thiep.

INSTALL:
1. BACKUP Unity project neu can.
2. Giai nen ZIP co Assets vao PROJECT ROOT (noi co Packages).
   GHI DE file .cs UI58, GIU NGUYEN file .meta hien co.
3. Thoat Play, cho Unity compile xong, mo 04_Gameplay.
4. Tools > Rhythm Kitchen > UI58 - Timer + 2 Fingers
   > 04 - Deep Repair RK58 SongBank (Save Scene)
5. Ban sao scene nam o PROJECT ROOT / RK58SceneBackups/.
6. Dong Scene, mo lai, kiem tra Console.
7. Neu songs=0, run 03 - Import Full + MIDI Pairs.
8. Neu canh bao con, gui Console log moi tu patch nay bao gom:
   "[RK58 SongBank] Incorrect serialized m_Script: ..."
   "[RK58 SongBank] m_Script rebind not accepted..."
   (can kiem tra GUID trong .meta, duplicate script, prefab/scene khac).

KHONG:
- Khong xoa RK58Runtime.cs shim.
- Khong tu y xoa GUID .meta.
- Khong sua NoteController, scoring, gameplay.
- Import Full/MIDI hien van tao JSON, chua auto connect NoteSpawner.

STATUS:
Static source checks + GitHub file readback: OK.
Unity Editor Play-test: chua thuc hien trong moi truong nay.
