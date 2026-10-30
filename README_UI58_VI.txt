RHYTHM KITCHEN UI58 - SAFE SONG BANK HOTFIX (2026-10-30)
====================================================

LOI TRUOC DAY:
[RK58 SongBank] Incorrect serialized m_Script: (runtime MonoScript ).
ArgumentException: Object at index 0 is null
RK58SongBankDeepRepair.EnsureSerializedScript(...)

NGUYEN NHAN:
Ban cu set SerializedProperty("m_Script").objectReferenceValue tren
component dang ton tai. Unity co the huy/vo hieu hoa component ngay
khi ApplyModifiedProperties, sau do new SerializedObject(instance) nem loi.

BAN MOI:
- Khong sua m_Script truc tiep tren component dang song.
- Tao GameObject tam, gan RK58SongBank moi de kiem tra Unity
  co luu dung m_Script tu RK58SongBank.cs hay khong. Xoa temp sau.
- Neu probe fail: DUNG, khong xoa script cu; in chan doan
  class/assembly/path/GUID. Dung menu 05 de xem chi tiet.
- Neu probe thanh cong: luu ban sao scene, doc va luu danh
  sach songs + AudioSource, sau do tao component moi dung
  va moi xoa reference cu sau khi verify.
- Khong xoa cac SongBank duplicate co the chua du lieu cua user.
- Khong tao audio player thu 2. Khong can thiep gameplay.

CAI DAT:
1. Sao luu project (da co 1 ban sao luu
   RK58SceneBackups/04_Gameplay_20261030_214602_642.unity).
2. Thoat Play Mode.
3. Tai ZIP moi, giai nen vao PROJECT ROOT, ghi de file .cs.
   KHONG xoa hoac tao lai file .meta.
4. Unity compile -> mo scene 04_Gameplay.unity.
5. Tools > Rhythm Kitchen > UI58 - Timer + 2 Fingers
   > 04 - Deep Repair RK58 SongBank (Save Scene)
6. Ctrl+S, dong Scene va mo lai, kiem tra Console.
7. Neu van co PROBE FAILED:
   > 05 - Diagnose RK58 Script Bindings
   Gui log [RK58 Diagnose] de xac dinh script GUID
   hoac class bi duplicate trong project.

Luu y:
Chua Play-test Unity 6 trong moi truong nay.
Vi backup da co, khong can xoa/doi ten scene thu cong.
