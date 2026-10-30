#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using TMPro;

/// <summary>
/// Converts old UI58 scene MonoScript references to matching-file components.
/// Leaves the rest of the Scene, gameplay callbacks and timing logic untouched.
/// </summary>
public static class RK58SceneReferenceRepair
{
    private const string MENU = "Tools/Rhythm Kitchen/UI58 - Timer + 2 Fingers/";

    [MenuItem(MENU + "00 - Repair UI58 Scene References")]
    public static void Repair()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode)
        {
            EditorUtility.DisplayDialog("RK58 Repair",
                "Thoat Play Mode truoc khi Repair.", "OK");
            return;
        }
        Scene scene = SceneManager.GetActiveScene();
        if (!scene.IsValid() || !scene.isLoaded)
        {
            Debug.LogError("[RK58 Repair] Open 04_Gameplay first.");
            return;
        }

        bool timer = RepairTimer(scene);
        bool multi = RebuildMultitouch(scene);
        bool bank = RK58SongBankDeepRepair.EnsureSingleBank(scene) != null;

        EditorSceneManager.MarkSceneDirty(scene);
        Debug.Log("[RK58 Repair] TimerPlate=" + timer +
            ", RK58_Multitouch=" + multi + ", RK58_SongBank=" + bank +
            ". Save scene then close/reopen to validate.");

        EditorUtility.DisplayDialog("RK58 Scene Repair",
            "TimerPlate: " + (timer ? "OK" : "Khong tim thay") +
            "\nMultitouch: " + (multi ? "OK" : "FAILED") +
            "\nSongBank: " + (bank ? "OK" : "FAILED") +
            "\n\nNhan Ctrl+S, dong Scene va mo lai." +
            "\nNeu timer chua duoc gan, chay 01 - Fix Timer." +
            "\nNeu song list trong, chay 03 - Import Full + MIDI Pairs.",
            "OK");
    }

    private static GameObject FindNamed(Scene scene, string name)
    {
        foreach (GameObject root in scene.GetRootGameObjects())
        {
            foreach (Transform tr in root.GetComponentsInChildren<Transform>(true))
                if (tr.name == name) return tr.gameObject;
        }
        return null;
    }

    private static void CleanMissingOn(GameObject target)
    {
        if (!target) return;
        int count = GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(target);
        if (count > 0)
        {
            Debug.LogWarning("[RK58 Repair] Removing " + count +
                " missing script(s) from " + target.name +
                ". Make sure you backed up the scene first.");
            Undo.RegisterFullObjectHierarchyUndo(target, "RK58 Clean Missing Script");
            GameObjectUtility.RemoveMonoBehavioursWithMissingScript(target);
        }
    }

    private static bool RepairTimer(Scene scene)
    {
        GameObject plate = FindNamed(scene, "TimerPlate");
        if (!plate) return false;

        RK58Runtime legacy = plate.GetComponent<RK58Runtime>();
        RK58TimerView view = plate.GetComponent<RK58TimerView>();

        if (!view) view = Undo.AddComponent<RK58TimerView>(plate);

        Undo.RecordObject(view, "RK58 Restore Timer View");
        if (legacy)
        {
            if (!view.sourceTMP) view.sourceTMP = legacy.sourceTMP;
            if (!view.sourceLegacy) view.sourceLegacy = legacy.sourceLegacy;
            if (!view.display) view.display = legacy.display;
            if (!view.fill) view.fill = legacy.fill;
            if (legacy.fullSeconds > 0f)
                view.fullSeconds = legacy.fullSeconds;
        }

        TMP_Text[] texts = plate.GetComponentsInChildren<TMP_Text>(true);
        if (!view.display)
            view.display = texts.OfType<TextMeshProUGUI>()
                .FirstOrDefault(t => t.name == "RK58_TimeText");
        if (!view.sourceTMP)
            view.sourceTMP = texts.FirstOrDefault(t =>
                t != view.display && !t.name.StartsWith("RK58_") &&
                LooksLikeTime(t.text));
        if (!view.sourceLegacy)
            view.sourceLegacy = plate.GetComponentsInChildren<Text>(true)
                .FirstOrDefault(t => LooksLikeTime(t.text));
        if (!view.fill)
            view.fill = plate.GetComponentsInChildren<Image>(true)
                .FirstOrDefault(i => i.name == "RK58_MintFill");

        EditorUtility.SetDirty(view);
        if (legacy) Undo.DestroyObjectImmediate(legacy);
        CleanMissingOn(plate);
        if (!view.display || !view.fill || (!view.sourceTMP && !view.sourceLegacy))
            Debug.LogWarning("[RK58 Repair] TimerPlate was migrated, but one or " +
                "more visual links are missing. Run 01 - Fix Timer + Enable Two Fingers.");
        return true;
    }

    private static bool LooksLikeTime(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        string[] s = value.Trim().Split(':');
        int m, sec;
        return s.Length == 2 && int.TryParse(s[0], out m) &&
            int.TryParse(s[1], out sec) && m >= 0 && sec >= 0 && sec <= 59;
    }

    private static GameObject ReplaceUtility(Scene scene, string name)
    {
        GameObject old = FindNamed(scene, name);
        Transform parent = old ? old.transform.parent : null;
        int sibling = old ? old.transform.GetSiblingIndex() : -1;

        GameObject obj = new GameObject(name);
        if (old)
        {
            obj.transform.SetParent(parent, false);
            obj.transform.SetSiblingIndex(sibling);
            obj.SetActive(old.activeSelf);
            obj.layer = old.layer;
            obj.tag = old.tag;
            obj.transform.localPosition = old.transform.localPosition;
            obj.transform.localRotation = old.transform.localRotation;
            obj.transform.localScale = old.transform.localScale;
        }
        Undo.RegisterCreatedObjectUndo(obj, "RK58 Create " + name);
        if (old) Undo.DestroyObjectImmediate(old);
        return obj;
    }

    private static bool RebuildMultitouch(Scene scene)
    {
        GameObject go = ReplaceUtility(scene, "RK58_Multitouch");
        if (!go) return false;
        Undo.AddComponent<RK58EnableMultitouch>(go);
        return go.GetComponent<RK58EnableMultitouch>() != null;
    }

    private static bool RebuildBank(Scene scene)
    {
        GameObject old = FindNamed(scene, "RK58_SongBank");
        AudioSource conductor = null;
        List<RK58SongEntry> songs = null;

        if (old)
        {
            RK58SongBank bank = old.GetComponent<RK58SongBank>();
            if (bank)
            {
                conductor = bank.conductorAudio;
                if (bank.songs != null)
                    songs = new List<RK58SongEntry>(bank.songs);
            }
            RK58Runtime legacy = old.GetComponent<RK58Runtime>();
            if (legacy)
            {
                if (!conductor) conductor = legacy.conductorAudio;
                if ((songs == null || songs.Count == 0) && legacy.songs != null)
                    songs = new List<RK58SongEntry>(legacy.songs);
            }
        }

        GameObject obj = ReplaceUtility(scene, "RK58_SongBank");
        RK58SongBank fresh = Undo.AddComponent<RK58SongBank>(obj);
        fresh.conductorAudio = conductor;
        if (songs != null) fresh.songs = songs;
        else Debug.LogWarning("[RK58 Repair] SongBank data unavailable. " +
                "Run 03 - Import Full + MIDI Pairs.");
        EditorUtility.SetDirty(fresh);
        return true;
    }
}
#endif
