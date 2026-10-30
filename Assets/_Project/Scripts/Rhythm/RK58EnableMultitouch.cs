using UnityEngine;

[DisallowMultipleComponent]
public sealed class RK58EnableMultitouch : MonoBehaviour
{
    void Awake()
    {
#if ENABLE_LEGACY_INPUT_MANAGER
        Input.multiTouchEnabled = true;
#endif
    }
    // Gameplay04IngredientNoteVisual already handles one pointerId PER NOTE.
    // Let EventSystem send the two touches separately. Do not simulate
    // extra pointer events or this can score a note more than once.
}

