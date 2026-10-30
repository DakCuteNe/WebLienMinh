#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// Repairs a stale RK58_SongBank MonoScript reference while keeping
/// AudioClip/TextAsset references when Unity can deserialize them.
/// This is a manual, idempotent Scene operation (not an automatic callback).
/// </summary>
public static class RK58SongBankDeepRepair
{
    const string MENU = "Tools/Rhythm Kitchen/UI58 - Timer + 2 Fingers/";
    const string SCRIPT = "Assets/_Project/Scripts/Rhythm/RK58SongBank.cs";

    [MenuItem(MENU + "04 - Deep Repair RK58 SongBank (Save Scene)")]
    public static void Run()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode)
        {
            EditorUtility.DisplayDialog("UI58 SongBank", "Exit Play Mode first.", "OK");
            return;
        }

        Scene scene = SceneManager.GetActiveScene();
        if (!scene.IsValid() || !scene.isLoaded || string.IsNullOrEmpty(scene.path))
        {
            EditorUtility.DisplayDialog("UI58 SongBank",
                "Open and save 04_Gameplay.unity first.", "OK");
            return;
        }

        RK58SongBank bank = EnsureSingleBank(scene, true);
        if (!bank)
        {
            EditorUtility.DisplayDialog("UI58 SongBank",
                "Repair failed. Check the Console for duplicate or invalid scripts.", "OK");
            return;
        }

        EditorSceneManager.MarkSceneDirty(scene);
        bool saved = EditorSceneManager.SaveScene(scene);
        Debug.Log("[RK58 SongBank] Repair finished. " +
            "Scene saved=" + saved + ", songs=" + bank.songs.Count +
            ", component=" + AssetDatabase.GetAssetPath(MonoScript.FromMonoBehaviour(bank)));

        EditorUtility.DisplayDialog("UI58 SongBank",
            "RK58_SongBank repaired." +
            "\nSongs retained: " + bank.songs.Count +
            "\nScene saved: " + saved +
            "\n\nClose and reopen this Scene. If songs=0, use" +
            "\n03 - Import Full + MIDI Pairs.",
            "OK");
    }

    // Also used by the MIDI importer, so it can never leave a second object
    // with the same name when a stale component is present.
    public static RK58SongBank EnsureSingleBank(Scene scene, bool forceRebind = false)
    {
        MonoScript script = AssetDatabase.LoadAssetAtPath<MonoScript>(SCRIPT);
        if (!script || script.GetClass() != typeof(RK58SongBank))
        {
            Debug.LogError("[RK58 SongBank] Cannot resolve the expected " + SCRIPT +
                ". Remove duplicate RK58SongBank.cs scripts or C# compile errors first.");
            return null;
        }

        List<GameObject> objects = new List<GameObject>();
        foreach (GameObject root in scene.GetRootGameObjects())
            foreach (Transform t in root.GetComponentsInChildren<Transform>(true))
                if (t.name == "RK58_SongBank")
                    objects.Add(t.gameObject);

        // Prefer the GameObject carrying the most recoverable song entries.
        GameObject canonical = objects
            .OrderByDescending(o => BestSongCount(o))
            .ThenBy(o => o.transform.parent ? 1 : 0)
            .FirstOrDefault();

        AudioSource audio = null;
        List<RK58SongEntry> savedSongs = new List<RK58SongEntry>();
        foreach (GameObject item in objects)
        {
            RK58SongBank bank = item.GetComponent<RK58SongBank>();
            if (bank)
            {
                if (bank.conductorAudio && !audio) audio = bank.conductorAudio;
                if (bank.songs != null && bank.songs.Count > savedSongs.Count)
                    savedSongs = new List<RK58SongEntry>(bank.songs);
            }
            RK58Runtime old = item.GetComponent<RK58Runtime>();
            if (old)
            {
                if (old.conductorAudio && !audio) audio = old.conductorAudio;
                if (old.songs != null && old.songs.Count > savedSongs.Count)
                    savedSongs = new List<RK58SongEntry>(old.songs);
            }
        }

        if (!canonical)
        {
            canonical = new GameObject("RK58_SongBank");
            SceneManager.MoveGameObjectToScene(canonical, scene);
            Undo.RegisterCreatedObjectUndo(canonical, "RK58 Create SongBank");
        }

        bool stale = forceRebind || objects.Count > 1 ||
            canonical.GetComponents<RK58SongBank>().Length != 1 ||
            canonical.GetComponent<RK58Runtime>() != null ||
            GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(canonical) > 0;

        if (!stale)
        {
            RK58SongBank good = canonical.GetComponent<RK58SongBank>();
            MonoScript boundScript = MonoScript.FromMonoBehaviour(good);
            if (boundScript != script) stale = true;
            else return good;
        }

        // Keep canonical GameObject, children and external references intact.
        foreach (RK58SongBank bank in canonical.GetComponents<RK58SongBank>())
            if (bank) Undo.DestroyObjectImmediate(bank);

        foreach (RK58Runtime old in canonical.GetComponents<RK58Runtime>())
            if (old) Undo.DestroyObjectImmediate(old);

        if (GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(canonical) > 0)
        {
            Undo.RegisterFullObjectHierarchyUndo(canonical, "RK58 Remove Stale Script");
            GameObjectUtility.RemoveMonoBehavioursWithMissingScript(canonical);
        }

        RK58SongBank rebuilt = Undo.AddComponent<RK58SongBank>(canonical);
        if (!rebuilt || MonoScript.FromMonoBehaviour(rebuilt) != script)
        {
            Debug.LogError("[RK58 SongBank] Unable to attach the expected RK58SongBank.cs.");
            return null;
        }

        rebuilt.conductorAudio = audio;
        rebuilt.songs = savedSongs;
        EditorUtility.SetDirty(rebuilt);

        // Remove ONLY empty, UI58-generated duplicates. Never destroy other
        // user objects or children automatically.
        foreach (GameObject other in objects)
        {
            if (other == canonical) continue;

            bool safe = other.transform.childCount == 0 &&
                other.GetComponents<Component>().All(c =>
                    c == null || c is Transform ||
                    c is RK58Runtime || c is RK58SongBank);

            if (safe)
                Undo.DestroyObjectImmediate(other);
            else
                Debug.LogWarning("[RK58 SongBank] A duplicate contains other components or children: " +
                    GetPath(other.transform) + ". Review and remove manually.");
        }

        EditorSceneManager.MarkSceneDirty(scene);
        Debug.Log("[RK58 SongBank] Recreated component on " +
            GetPath(canonical.transform) + ". Restored " + savedSongs.Count + " songs.");

        return rebuilt;
    }

    static int BestSongCount(GameObject go)
    {
        int count = 0;
        RK58SongBank bank = go.GetComponent<RK58SongBank>();
        if (bank && bank.songs != null) count = bank.songs.Count;
        RK58Runtime legacy = go.GetComponent<RK58Runtime>();
        if (legacy && legacy.songs != null)
            count = Mathf.Max(count, legacy.songs.Count);
        return count;
    }

    static string GetPath(Transform t)
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
