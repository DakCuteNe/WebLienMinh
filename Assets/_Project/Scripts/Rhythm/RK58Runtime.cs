using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

// Legacy scene GUID recovery. The old UI58 attached this file's MonoScript
// to TimerPlate / RK58_Multitouch / RK58_SongBank even though the file name
// did not match the original MonoBehaviour type.
// Keep this filename + matching class until ALL old scenes are migrated.
// This shim performs no gameplay work and is removed by the Repair menu.
[AddComponentMenu("")]
[DisallowMultipleComponent]
public sealed class RK58Runtime : MonoBehaviour
{
    [HideInInspector] public TMP_Text sourceTMP;
    [HideInInspector] public Text sourceLegacy;
    [HideInInspector] public TextMeshProUGUI display;
    [HideInInspector] public Image fill;
    [HideInInspector] public float fullSeconds = 60f;

    [HideInInspector] public AudioSource conductorAudio;
    [HideInInspector] public List<RK58SongEntry> songs =
        new List<RK58SongEntry>();
}
