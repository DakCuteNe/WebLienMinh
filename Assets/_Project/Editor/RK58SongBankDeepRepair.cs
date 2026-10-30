#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// Repairs the serialized m_Script GUID of RK58SongBank safely.
/// An older patch failed at MonoScript.FromMonoBehaviour(newComponent) != expected,
/// after deleting old components. This patch never deletes data before validation.
/// </summary>
public static class RK58SongBankDeepRepair
{
    private const string MENU = "Tools/Rhythm Kitchen/UI58 - Timer + 2 Fingers/";
    private const string SCRIPT_PATH = "Assets/_Project/Scripts/Rhythm/RK58SongBank.cs";
    private const string NAME = "RK58_SongBank";

    [MenuItem(MENU + "04 - Deep Repair RK58 SongBank (Save Scene)")]
    public static void Run()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode)
        {
            EditorUtility.DisplayDialog("RK58 SongBank", "Exit Play Mode first.", "OK");
            return;
        }

        Scene scene = SceneManager.GetActiveScene();
        if (!scene.IsValid() || !scene.isLoaded || string.IsNullOrEmpty(scene.path))
        {
            EditorUtility.DisplayDialog("RK58 SongBank",
                "Open and save 04_Gameplay.unity first.", "OK");
            return;
        }

        // Preserve the current scene (including unsaved changes) before repair.
        // The backup goes OUTSIDE Assets so Unity does not import a duplicate scene.
        if (!EditorSceneManager.SaveScene(scene))
        {
            Debug.LogError("[RK58 SongBank] Could not save scene before making a backup.");
            return;
        }
        try
        {
            string root = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
            string backupFolder = Path.Combine(root, "RK58SceneBackups");
            Directory.CreateDirectory(backupFolder);
            string backup = Path.Combine(backupFolder,
                Path.GetFileNameWithoutExtension(scene.path) + "_" +
                DateTime.Now.ToString("yyyyMMdd_HHmmss_fff") + ".unity");
            File.Copy(Path.GetFullPath(scene.path), backup, false);
            Debug.Log("[RK58 SongBank] Backup saved: " + backup);
        }
        catch (Exception ex)
        {
            Debug.LogError("[RK58 SongBank] Backup failed; repair cancelled: " + ex.Message);
            return;
        }

        RK58SongBank bank = EnsureSingleBank(scene, true);
        if (!bank)
        {
            EditorUtility.DisplayDialog("RK58 SongBank",
                "Cannot verify the script link; scene was NOT saved after repair." +
                "\nSee Console details. A backup is in RK58SceneBackups.",
                "OK");
            return;
        }

        EditorSceneManager.MarkSceneDirty(scene);
        bool saved = EditorSceneManager.SaveScene(scene);
        Debug.Log("[RK58 SongBank] DONE. Scene saved=" + saved +
            ", songs=" + (bank.songs != null ? bank.songs.Count : 0) +
            ", binding=" + DescribeBinding(bank));

        EditorUtility.DisplayDialog("RK58 SongBank",
            "Script repaired and scene saved: " + saved +
            "\nSongs retained: " + (bank.songs != null ? bank.songs.Count : 0) +
            "\nBackup: RK58SceneBackups/" +
            "\n\nClose and reopen 04_Gameplay to check Console.",
            "OK");
    }

    /// <summary>
    /// Idempotent. Used by the importer and reference-repair menu.
    /// Never destroys an existing SongBank until the replacement is verified.
    /// </summary>
    public static RK58SongBank EnsureSingleBank(Scene scene, bool forceRebind = false)
    {
        MonoScript expected = AssetDatabase.LoadAssetAtPath<MonoScript>(SCRIPT_PATH);
        if (!expected || expected.GetClass() != typeof(RK58SongBank))
        {
            Debug.LogError("[RK58 SongBank] Script asset doesn't resolve to RK58SongBank. " +
                "Expected path=" + SCRIPT_PATH + ", class=" +
                (expected && expected.GetClass() != null
                    ? expected.GetClass().FullName : "(null)") +
                ". Check compile errors and duplicate scripts.");
            return null;
        }

        List<GameObject> objects = FindObjects(scene);
        // Prefer the object with song data, then one with an existing bank.
        GameObject canonical = objects
            .OrderByDescending(BestSongCount)
            .ThenByDescending(o => o.GetComponent<RK58SongBank>() ? 1 : 0)
            .FirstOrDefault();

        AudioSource savedAudio = null;
        List<RK58SongEntry> savedSongs = new List<RK58SongEntry>();
        foreach (GameObject go in objects)
        {
            RK58SongBank bank = go.GetComponent<RK58SongBank>();
            if (bank)
            {
                if (!savedAudio && bank.conductorAudio) savedAudio = bank.conductorAudio;
                if (bank.songs != null && bank.songs.Count > savedSongs.Count)
                    savedSongs = new List<RK58SongEntry>(bank.songs);
            }

            RK58Runtime legacy = go.GetComponent<RK58Runtime>();
            if (legacy)
            {
                if (!savedAudio && legacy.conductorAudio)
                    savedAudio = legacy.conductorAudio;
                if (legacy.songs != null && legacy.songs.Count > savedSongs.Count)
                    savedSongs = new List<RK58SongEntry>(legacy.songs);
            }
        }

        bool created = false;
        if (!canonical)
        {
            canonical = new GameObject(NAME);
            SceneManager.MoveGameObjectToScene(canonical, scene);
            Undo.RegisterCreatedObjectUndo(canonical, "RK58 Create SongBank");
            created = true;
        }

        RK58SongBank existing = canonical.GetComponent<RK58SongBank>();
        bool added = false;
        if (!existing)
        {
            existing = Undo.AddComponent<RK58SongBank>(canonical);
            added = true;
        }
        if (!existing)
        {
            Debug.LogError("[RK58 SongBank] AddComponent<RK58SongBank> returned null.");
            return null;
        }

        // Check the serialized script reference, NOT only MonoScript.FromMonoBehaviour.
        // Rebind the m_Script property to the actual .cs asset if the GUID differs.
        if (!EnsureSerializedScript(existing, expected))
        {
            Debug.LogError("[RK58 SongBank] The component is a RK58SongBank but its " +
                "serialized script asset still differs. " + DescribeBinding(existing) +
                "\nExpected GUID=" + AssetDatabase.AssetPathToGUID(SCRIPT_PATH) +
                ". Check RK58SongBank.cs.meta and duplicate assembly definitions.");
            if (added) Undo.DestroyObjectImmediate(existing);
            // The legacy components and song list are deliberately untouched.
            return null;
        }

        // A verified component now exists. Preserve nonempty songs even if the
        // current import found 0 matching MIDI/audio pairs.
        Undo.RecordObject(existing, "RK58 Restore SongBank Data");
        if (!existing.conductorAudio && savedAudio)
            existing.conductorAudio = savedAudio;
        if ((existing.songs == null || existing.songs.Count == 0 ||
             savedSongs.Count > existing.songs.Count) &&
            savedSongs.Count > 0)
            existing.songs = savedSongs;
        else if (existing.songs == null)
            existing.songs = new List<RK58SongEntry>();
        EditorUtility.SetDirty(existing);

        // Only NOW remove the old incompatible component on this one GameObject.
        foreach (RK58Runtime old in canonical.GetComponents<RK58Runtime>())
            if (old) Undo.DestroyObjectImmediate(old);

        // Missing MonoBehaviour placeholders can be removed. A Unity MonoScript
        // serialized as a Component is a distinct issue; it may require deleting
        // the precise invalid component through Inspector or YAML after backup.
        int missing = GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(canonical);
        if (missing > 0)
        {
            Undo.RegisterFullObjectHierarchyUndo(canonical, "RK58 Remove Missing Scripts");
            GameObjectUtility.RemoveMonoBehavioursWithMissingScript(canonical);
        }

        foreach (GameObject duplicate in objects)
        {
            if (duplicate == canonical || !duplicate) continue;
            if (!IsDisposableDuplicate(duplicate))
            {
                Debug.LogWarning("[RK58 SongBank] Left a nonempty duplicate for manual " +
                    "review: " + HierarchyPath(duplicate.transform));
                continue;
            }
            Undo.DestroyObjectImmediate(duplicate);
        }

        EditorSceneManager.MarkSceneDirty(scene);
        Debug.Log("[RK58 SongBank] Verified " + HierarchyPath(canonical.transform) +
            "; restored " + savedSongs.Count + " songs; created=" + created +
            "; binding=" + DescribeBinding(existing));
        return existing;
    }

    private static bool EnsureSerializedScript(RK58SongBank instance, MonoScript expected)
    {
        if (!instance || !expected || expected.GetClass() != typeof(RK58SongBank))
            return false;
        SerializedObject so = new SerializedObject(instance);
        SerializedProperty prop = so.FindProperty("m_Script");
        if (prop == null || prop.propertyType != SerializedPropertyType.ObjectReference)
        {
            Debug.LogError("[RK58 SongBank] m_Script property is unavailable.");
            return false;
        }

        if (prop.objectReferenceValue != expected)
        {
            Debug.LogWarning("[RK58 SongBank] Incorrect serialized m_Script: " +
                ScriptPath(prop.objectReferenceValue as MonoScript) +
                ". Rebinding to " + SCRIPT_PATH);

            Undo.RecordObject(instance, "RK58 Rebind MonoScript Asset");
            so.Update();
            prop = so.FindProperty("m_Script");
            prop.objectReferenceValue = expected;
            so.ApplyModifiedProperties();
        }

        SerializedObject after = new SerializedObject(instance);
        SerializedProperty check = after.FindProperty("m_Script");
        bool matches = check != null && check.objectReferenceValue == expected;
        if (!matches)
        {
            Debug.LogError("[RK58 SongBank] m_Script rebind not accepted. Current=" +
                (check != null
                    ? ScriptPath(check.objectReferenceValue as MonoScript)
                    : "(missing property)"));
            return false;
        }

        // Older editor builds can return a runtime MonoScript from
        // FromMonoBehaviour even while the serialized m_Script is correct.
        // That result alone must not trigger deletion of the component.
        MonoScript from = MonoScript.FromMonoBehaviour(instance);
        if (from != expected)
            Debug.LogWarning("[RK58 SongBank] FromMonoBehaviour returned " +
                ScriptPath(from) + " but serialized m_Script is now correct.");
        return true;
    }

    private static string DescribeBinding(RK58SongBank bank)
    {
        if (!bank) return "(component null)";
        SerializedObject so = new SerializedObject(bank);
        SerializedProperty m = so.FindProperty("m_Script");
        MonoScript serialized = m != null ? m.objectReferenceValue as MonoScript : null;
        MonoScript resolved = MonoScript.FromMonoBehaviour(bank);
        return "m_Script=" + ScriptPath(serialized) +
            " | FromMonoBehaviour=" + ScriptPath(resolved) +
            " | type=" + bank.GetType().FullName;
    }

    private static string ScriptPath(MonoScript script)
    {
        if (!script) return "(null/runtime)";
        string path = AssetDatabase.GetAssetPath(script);
        return !string.IsNullOrEmpty(path) ? path :
            "(runtime MonoScript " + script.name + ")";
    }

    private static List<GameObject> FindObjects(Scene scene)
    {
        List<GameObject> all = new List<GameObject>();
        foreach (GameObject root in scene.GetRootGameObjects())
            foreach (Transform t in root.GetComponentsInChildren<Transform>(true))
                if (t.name == NAME)
                    all.Add(t.gameObject);
        return all;
    }

    private static int BestSongCount(GameObject go)
    {
        int n = 0;
        RK58SongBank bank = go.GetComponent<RK58SongBank>();
        if (bank && bank.songs != null) n = bank.songs.Count;
        RK58Runtime legacy = go.GetComponent<RK58Runtime>();
        if (legacy && legacy.songs != null)
            n = Mathf.Max(n, legacy.songs.Count);
        return n;
    }

    private static bool IsDisposableDuplicate(GameObject go)
    {
        if (!go || go.transform.childCount > 0) return false;
        foreach (Component c in go.GetComponents<Component>())
        {
            if (c == null) return false; // unknown script: don't delete blind
            if (!(c is Transform || c is RK58SongBank || c is RK58Runtime))
                return false;
        }
        return true;
    }

    private static string HierarchyPath(Transform t)
    {
        string path = t.name;
        while (t.parent)
        {
            t = t.parent;
            path = t.name + "/" + path;
        }
        return path;
    }
}
#endif
