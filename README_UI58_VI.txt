RHYTHM KITCHEN UI58 — HOTFIX SONGBANK (2026-10-30)
=================================================
Trieu chung:
GameObject (named 'RK58_SongBank') references runtime script in scene file. Fixing!

Nguyen nhan:
Scene cu van luu m_Script tham chieu MonoScript truoc khi tach RK58Runtime.cs.
MIDI importer cu quet theo component type. Khi MonoBehaviour hu, no khong tim
thay va tao them mot GameObject RK58_SongBank, khien canh bao con mai.

SUA TRONG GOI:
- RK58SongBankDeepRepair.cs: menu chu dong sua 1 object, tu dong bo
  missing-script, tao lai component RK58SongBank tu dung file RK58SongBank.cs.
- Thu hoi song list + AudioSource neu Unity van giai ma duoc.
- Giu nguyen GameObject va children (khong xoa Scene UI).
- Chi xoa duplicate RK58_SongBank khi duplicate khong co con va
  khong co component khac.
- Sua MIDI importer: tim object theo ten va repair, KHONG tao them
  RK58_SongBank moi khi object cu dang bi loi.
- Import MIDI 0 bai khong xoa nhac da import truoc.
- Menu 00 cung dung helper repair, khong rebuild SongBank khoe neu khong can.

CAI DAT:
1. Backup file 04_Gameplay.unity trong Assets/_Project/Scenes.
2. Thoat Play Mode, giai nen ZIP vao goc project (noi co Assets/).
3. Ghi de file .cs UI58; GIU NGUYEN .meta co san.
4. Cho Unity compile xong, mo 04_Gameplay.
5. Chay: Tools > Rhythm Kitchen > UI58 - Timer + 2 Fingers
   > 04 - Deep Repair RK58 SongBank (Save Scene).
6. Script tu dong Save Scene.
7. Dong Scene, mo lai; check Console.
8. Neu SongBank songs = 0: chay 03 - Import Full + MIDI Pairs.
9. Neu con canh bao, tim "RK58_SongBank" trong scene khac/prefab,
   va kiem tra duplicate class RK58SongBank.cs hoac GUID .meta.

Chua the Play-test Unity trong moi truong nay. Nhan dinh ma nguon
duoc verify tren GitHub. MIDI note data chua tu dong gan vao NoteSpawner.
