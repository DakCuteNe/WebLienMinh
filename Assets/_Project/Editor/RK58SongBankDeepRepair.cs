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
/// Repairs RK58_SongBank references WITHOUT writing to a live MonoBehaviour.m_Script.
/// An m_Script write can immediately invalidate the Unity component wrapper,
/// causing "SerializedObject: Object at index 0 is null".
/// </summary>
public static class RK58SongBankDeepRepair
{
    const string MENU = "Tools/Rhythm Kitchen/UI58 - Timer + 2 Fingers/";
    const string SCRIPT_PATH = "Assets/_Project/Scripts/Rhythm/RK58SongBank.cs";
    const string LEGACY_PATH = "Assets/_Project/Scripts/Rhythm/RK58Runtime.cs";
    const string BANK_NAME = "RK58_SongBank";

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
                "Open 04_Gameplay.unity first.", "OK");
            return;
        }

        // Probe BEFORE doing anything destructive. No component is modified in-place.
        MonoScript expected = ResolveScript();
        if (!expected || !ProbeRuntimeBinding(expected))
        {
            DiagnoseScriptAssets(expected);
            EditorUtility.DisplayDialog("RK58 SongBank",
                "Repair NOT applied. The new RK58SongBank component did not " +
                "resolve to RK58SongBank.cs in a test GameObject.\n" +
                "Check Console and duplicated .cs/.meta files. " +
                "No SongBank or scene references were removed.", "OK");
            return;
        }

        if (!BackupScene(scene)) return;

        RK58SongBank bank = EnsureSingleBank(scene, false);
        if (!bank)
        {
            Debug.LogError("[RK58 SongBank] Repair did not complete. " +
                "Use Edit > Undo if anything changed; backup was saved.");
            return;
        }

        EditorSceneManager.MarkSceneDirty(scene);
        bool saved = EditorSceneManager.SaveScene(scene);
        Debug.Log("[RK58 SongBank] Repair completed: saved=" + saved +
            "; songs=" + (bank.songs != null ? bank.songs.Count : 0) +
            "; script=" + GetScriptPath(bank));
        EditorUtility.DisplayDialog("RK58 SongBank",
            "Repair: " + (saved ? "Saved" : "Save failed") +
            "\nSongs: " + (bank.songs != null ? bank.songs.Count : 0) +
            "\n\nA copy is in RK58SceneBackups beside Assets.\n" +
            "Close/reopen the Scene and inspect Console.", "OK");
    }

    [MenuItem(MENU + "05 - Diagnose RK58 Script Bindings")]
    public static void Diagnose()
    {
        MonoScript expected = ResolveScript();
        DiagnoseScriptAssets(expected);
        if (expected) ProbeRuntimeBinding(expected);

        Scene scene = SceneManager.GetActiveScene();
        if (!scene.IsValid() || !scene.isLoaded) return;
        foreach (GameObject go in FindBanks(scene))
        {
            Debug.Log("[RK58 Diagnose] GameObject=" + HierarchyPath(go.transform) +
                "; components=" + go.GetComponents<Component>().Length +
                "; missing=" + GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(go));
            foreach (RK58SongBank b in go.GetComponents<RK58SongBank>())
                if (b) Debug.Log("[RK58 Diagnose] BANK " + GetScriptPath(b) +
                    " songs=" + (b.songs != null ? b.songs.Count : 0), b);
            foreach (RK58Runtime b in go.GetComponents<RK58Runtime>())
                if (b) Debug.Log("[RK58 Diagnose] LEGACY " + GetScriptPath(b), b);
        }
    }

    /// <summary>
    /// Called by MIDI importer. Returns null without mutation if Unity cannot
    /// create a properly serialized RK58SongBank component.
    /// </summary>
    public static RK58SongBank EnsureSingleBank(Scene scene, bool forceRebind = false)
    {
        MonoScript expected = ResolveScript();
        if (!expected || !ProbeRuntimeBinding(expected))
        {
            DiagnoseScriptAssets(expected);
            return null;
        }

        List<GameObject> objects = FindBanks(scene);
        GameObject canonical = objects
            .OrderByDescending(BestSongCount)
            .ThenByDescending(go => go.GetComponent<RK58SongBank>() ? 1 : 0)
            .FirstOrDefault();

        AudioSource audio = null;
        List<RK58SongEntry> savedSongs = new List<RK58SongEntry>();
        foreach (GameObject go in objects)
        {
            RK58SongBank bank = go.GetComponent<RK58SongBank>();
            if (bank)
            {
                if (!audio && bank.conductorAudio) audio = bank.conductorAudio;
                if (bank.songs != null && bank.songs.Count > savedSongs.Count)
                    savedSongs = new List<RK58SongEntry>(bank.songs);
            }
            RK58Runtime legacy = go.GetComponent<RK58Runtime>();
            if (legacy)
            {
                if (!audio && legacy.conductorAudio) audio = legacy.conductorAudio;
                if (legacy.songs != null && legacy.songs.Count > savedSongs.Count)
                    savedSongs = new List<RK58SongEntry>(legacy.songs);
            }
        }

        if (!canonical)
        {
            canonical = new GameObject(BANK_NAME);
            SceneManager.MoveGameObjectToScene(canonical, scene);
            Undo.RegisterCreatedObjectUndo(canonical, "RK58 Create SongBank");
        }

        RK58SongBank existing = canonical.GetComponent<RK58SongBank>();
        bool verifiedExisting = existing && IsSerializedToExpected(existing, expected);
        bool needsReplacement = !verifiedExisting;

        if (needsReplacement)
        {
            // The throwaway probe has ALREADY demonstrated that AddComponent works.
            // Remove the bad component only now, and let Unity create m_Script normally.
            if (existing)
                Undo.DestroyObjectImmediate(existing);
            existing = Undo.AddComponent<RK58SongBank>(canonical);

            if (!existing || !IsSerializedToExpected(existing, expected))
            {
                Debug.LogError("[RK58 SongBank] A test GameObject verified correctly " +
                    "but adding the component to the actual object did not. " +
                    "Use Edit > Undo to reverse the last operation. " +
                    "Do not save the scene; use your backup.");
                return null;
            }
        }

        Undo.RecordObject(existing, "RK58 Restore SongBank Fields");
        if (!existing.conductorAudio && audio) existing.conductorAudio = audio;
        if (existing.songs == null || savedSongs.Count > existing.songs.Count)
            existing.songs = new List<RK58SongEntry>(savedSongs);
        EditorUtility.SetDirty(existing);

        // Safe cleanup AFTER successful binding. Do not touch unrelated components.
        foreach (RK58Runtime old in canonical.GetComponents<RK58Runtime>())
            if (old) Undo.DestroyObjectImmediate(old);
        int missing = GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(canonical);
        if (missing > 0)
        {
            Undo.RegisterFullObjectHierarchyUndo(canonical, "RK58 Remove Missing Scripts");
            GameObjectUtility.RemoveMonoBehavioursWithMissingScript(canonical);
        }

        // Do not delete duplicate GameObjects automatically. They might carry
        // unrecognized serialized song data or references from other systems.
        if (objects.Count > 1)
            Debug.LogWarning("[RK58 SongBank] Found " + objects.Count +
                " named SongBank objects. Kept all for manual review.");

        EditorSceneManager.MarkSceneDirty(scene);
        Debug.Log("[RK58 SongBank] Verified component on " +
            HierarchyPath(canonical.transform) + " ; songs=" +
            (existing.songs != null ? existing.songs.Count : 0) +
            " ; m_Script=" + GetScriptPath(existing));

        return existing;
    }

    static MonoScript ResolveScript()
    {
        MonoScript expected = AssetDatabase.LoadAssetAtPath<MonoScript>(SCRIPT_PATH);
        if (!expected)
        {
            Debug.LogError("[RK58 SongBank] Missing MonoScript asset: " + SCRIPT_PATH);
            return null;
        }
        Type resolved = expected.GetClass();
        if (resolved != typeof(RK58SongBank))
        {
            Debug.LogError("[RK58 SongBank] Script class mismatch. Path=" + SCRIPT_PATH +
                "; GetClass=" + (resolved != null ? resolved.AssemblyQualifiedName : "(null)") +
                "; expected=" + typeof(RK58SongBank).AssemblyQualifiedName);
            return null;
        }
        return expected;
    }

    static bool ProbeRuntimeBinding(MonoScript expected)
    {
        // Never mutate the serialized m_Script. Verify Unity's actual
        // AddComponent binding on a disposable GameObject first.
        GameObject probe = new GameObject("__RK58_ScriptProbe");
        // Use ordinary scene-object serialization for the probe. HideAndDontSave
        // can yield a different MonoScript context from a saved Scene object.
        probe.SetActive(false);
        bool ok = false;
        try
        {
            RK58SongBank test = probe.AddComponent<RK58SongBank>();
            ok = test && IsSerializedToExpected(test, expected);
            if (!ok)
                Debug.LogError("[RK58 SongBank] PROBE FAILED. " +
                    "Unity cannot serialize a fresh RK58SongBank component to " +
                    SCRIPT_PATH + ". Refusing destructive repair.");
        }
        catch (Exception ex)
        {
            Debug.LogError("[RK58 SongBank] Probe exception: " + ex);
        }
        finally
        {
            UnityEngine.Object.DestroyImmediate(probe);
        }
        return ok;
    }

    static bool IsSerializedToExpected(RK58SongBank component, MonoScript expected)
    {
        if (!component || !expected) return false;
        try
        {
            SerializedObject so = new SerializedObject(component);
            SerializedProperty prop = so.FindProperty("m_Script");
            MonoScript actual = prop != null
                ? prop.objectReferenceValue as MonoScript : null;
            bool ok = actual == expected;
            if (!ok)
                Debug.LogWarning("[RK58 SongBank] Binding mismatch: actual=" +
                    ScriptDetails(actual) + " expected=" + ScriptDetails(expected));
            return ok;
        }
        catch (Exception ex)
        {
            Debug.LogError("[RK58 SongBank] SerializedObject unavailable: " + ex.Message);
            return false;
        }
    }

    static string GetScriptPath(RK58SongBank component)
    {
        if (!component) return "(null)";
        try
        {
            SerializedObject so = new SerializedObject(component);
            SerializedProperty prop = so.FindProperty("m_Script");
            MonoScript actual = prop != null
                ? prop.objectReferenceValue as MonoScript : null;
            return ScriptDetails(actual);
        }
        catch (Exception ex) { return "(not readable: " + ex.Message + ")"; }
    }

    static string GetScriptPath(RK58Runtime component)
    {
        if (!component) return "(null)";
        MonoScript script = MonoScript.FromMonoBehaviour(component);
        return ScriptDetails(script);
    }

    static string ScriptDetails(MonoScript script)
    {
        if (!script) return "(null)";
        string path = AssetDatabase.GetAssetPath(script);
        string guid = string.IsNullOrEmpty(path) ? "" : AssetDatabase.AssetPathToGUID(path);
        return "name=" + script.name +
            ", path=" + (string.IsNullOrEmpty(path) ? "(runtime)" : path) +
            ", guid=" + guid +
            ", type=" + (script.GetClass() != null ?
                script.GetClass().AssemblyQualifiedName : "(null)");
    }

    static void DiagnoseScriptAssets(MonoScript expected)
    {
        Debug.Log("[RK58 Diagnose] Expected asset: " + ScriptDetails(expected));
        Debug.Log("[RK58 Diagnose] Runtime class: " +
            typeof(RK58SongBank).AssemblyQualifiedName);
        Debug.Log("[RK58 Diagnose] Legacy GUID: " +
            AssetDatabase.AssetPathToGUID(LEGACY_PATH));
        foreach (string guid in AssetDatabase.FindAssets("RK58SongBank t:MonoScript"))
        {
            string p = AssetDatabase.GUIDToAssetPath(guid);
            MonoScript s = AssetDatabase.LoadAssetAtPath<MonoScript>(p);
            Debug.Log("[RK58 Diagnose] Candidate " + p + " -> " + ScriptDetails(s));
        }
    }

    static bool BackupScene(Scene scene)
    {
        try
        {
            if (!EditorSceneManager.SaveScene(scene))
                throw new IOException("Could not save scene");
            string project = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
            string backupFolder = Path.Combine(project, "RK58SceneBackups");
            Directory.CreateDirectory(backupFolder);
            string copy = Path.Combine(backupFolder,
                Path.GetFileNameWithoutExtension(scene.path) + "_" +
                DateTime.Now.ToString("yyyyMMdd_HHmmss_fff") + ".unity");
            File.Copy(Path.GetFullPath(scene.path), copy, false);
            Debug.Log("[RK58 SongBank] Backup saved: " + copy);
            return true;
        }
        catch (Exception ex)
        {
            Debug.LogError("[RK58 SongBank] Backup failed. Nothing repaired: " + ex);
            return false;
        }
    }

    static List<GameObject> FindBanks(Scene scene)
    {
        List<GameObject> list = new List<GameObject>();
        foreach (GameObject root in scene.GetRootGameObjects())
            foreach (Transform t in root.GetComponentsInChildren<Transform>(true))
                if (t.name == BANK_NAME) list.Add(t.gameObject);
        return list;
    }

    static int BestSongCount(GameObject go)
    {
        int count = 0;
        RK58SongBank bank = go.GetComponent<RK58SongBank>();
        RK58Runtime legacy = go.GetComponent<RK58Runtime>();
        if (bank && bank.songs != null) count = bank.songs.Count;
        if (legacy && legacy.songs != null)
            count = Mathf.Max(count, legacy.songs.Count);
        return count;
    }

    static string HierarchyPath(Transform t)
    {
        string s = t.name;
        while (t.parent) { t = t.parent; s = t.name + "/" + s; }
        return s;
    }
}
#endif
