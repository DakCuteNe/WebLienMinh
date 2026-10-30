#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// Repairs RK58 scene objects created by the old UI58 package, where multiple
/// MonoBehaviour types were declared in RK58Runtime.cs. The file/class mismatch
/// could leave "references runtime script in scene file. Fixing!" warnings.
/// Only objects named RK58_Multitouch and RK58_SongBank are replaced.
/// </summary>
public static class RK58SceneReferenceRepair
{
    private const string MENU = "Tools/Rhythm Kitchen/UI58 - Timer + 2 Fingers/";

    [MenuItem(MENU + "00 - Repair UI58 Scene References")]
    public static void Repair()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode)
        {
            EditorUtility.DisplayDialog("UI58", "Thoat Play Mode truoc khi Repair.", "OK");
            return;
        }

        Scene scene = SceneManager.GetActiveScene();
        if (!scene.IsValid() || !scene.isLoaded)
        {
            Debug.LogError("[RK58 Repair] Open 04_Gameplay scene first.");
            return;
        }

        bool multi = RebuildMultitouch(scene);
        bool bank = RebuildBank(scene);
        EditorSceneManager.MarkSceneDirty(scene);

        Debug.Log("[RK58 Repair] Rebuilt RK58_Multitouch = " + multi +
            "; RK58_SongBank = " + bank +
            ". Save scene, then reopen it to verify the warnings are gone.");

        EditorUtility.DisplayDialog("RK58 Scene References",
            "Da thay component UI58 cu bang script dung file:\n" +
            "- RK58_Multitouch: " + (multi ? "OK" : "FAILED") +
            "\n- RK58_SongBank: " + (bank ? "OK" : "FAILED") +
            "\n\nChay 01 - Fix Timer + Enable Two Fingers de lam moi timer." +
            "\nNeu SongBank khong co bai, chay 03 - Import Full + MIDI Pairs." +
            "\nCtrl+S, dong Scene va mo lai de kiem tra.",
            "OK");
    }

    private static GameObject FindNamed(Scene scene, string name)
    {
        foreach (GameObject root in scene.GetRootGameObjects())
        {
            foreach (Transform tr in root.GetComponentsInChildren<Transform>(true))
            {
                if (tr.name == name)
                    return tr.gameObject;
            }
        }
        return null;
    }

    private static GameObject ReplaceObject(Scene scene, string name)
    {
        GameObject old = FindNamed(scene, name);
        Transform parent = old ? old.transform.parent : null;
        int sibling = old ? old.transform.GetSiblingIndex() : -1;

        // Explicitly recreate ONLY the two UI58-generated utility objects.
        // Some Unity versions do not count a stale MonoScript as a missing
        // MonoBehaviour, so removing "Missing Script" may not fix this warning.
        GameObject replacement = new GameObject(name);
        if (old)
        {
            replacement.transform.SetParent(parent, false);
            replacement.transform.SetSiblingIndex(sibling);
            replacement.SetActive(old.activeSelf);
            replacement.layer = old.layer;
            replacement.tag = old.tag;
            replacement.transform.localPosition = old.transform.localPosition;
            replacement.transform.localRotation = old.transform.localRotation;
            replacement.transform.localScale = old.transform.localScale;
        }

        Undo.RegisterCreatedObjectUndo(replacement, "RK58 Repair " + name);
        if (old) Undo.DestroyObjectImmediate(old);
        return replacement;
    }

    private static bool RebuildMultitouch(Scene scene)
    {
        GameObject replacement = ReplaceObject(scene, "RK58_Multitouch");
        if (!replacement) return false;
        Undo.AddComponent<RK58EnableMultitouch>(replacement);
        return replacement.GetComponent<RK58EnableMultitouch>() != null;
    }

    private static bool RebuildBank(Scene scene)
    {
        GameObject old = FindNamed(scene, "RK58_SongBank");
        AudioSource conductor = null;
        List<RK58SongEntry> songs = null;

        if (old)
        {
            RK58SongBank previous = old.GetComponent<RK58SongBank>();
            if (previous)
            {
                conductor = previous.conductorAudio;
                if (previous.songs != null)
                    songs = new List<RK58SongEntry>(previous.songs);
            }
        }

        GameObject replacement = ReplaceObject(scene, "RK58_SongBank");
        if (!replacement) return false;

        RK58SongBank bank = Undo.AddComponent<RK58SongBank>(replacement);
        if (!bank) return false;
        bank.conductorAudio = conductor;
        if (songs != null)
            bank.songs = songs;
        else
            Debug.LogWarning("[RK58 Repair] Old SongBank data was not readable. " +
                "Run 03 - Import Full + MIDI Pairs to restore song links.");

        EditorUtility.SetDirty(bank);
        return true;
    }
}
#endif
