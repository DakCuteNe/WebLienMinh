const TARGET_SELECTOR = 'img.player-image, img.profile-player-image, img.team-logo, img.profile-team-logo';

function restoreFallback(image) {
  if (!(image instanceof HTMLImageElement)) return;
  image.style.display = 'none';
  const sibling = image.nextElementSibling;
  if (sibling?.classList?.contains('image-fallback')) sibling.classList.remove('hidden');
}

// Placeholder images exist only so the live Leaguepedia resolver can discover a photo
// even when the cached directory has image=null. Never leave that transparent placeholder
// visible if Leaguepedia also has no usable image.
document.addEventListener('load', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches(TARGET_SELECTOR)) return;
  if (image.dataset.mediaPlaceholder !== '1') return;

  const source = image.dataset.mediaSource || '';
  const original = image.dataset.originalSrc || image.getAttribute('src') || '';
  const stillPlaceholder = !source || (source === 'stored-original' && original.startsWith('data:image/'));
  if (stillPlaceholder) restoreFallback(image);
}, true);
