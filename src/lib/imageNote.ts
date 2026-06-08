import { analyzeImageToNote } from './ai';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('HumanBoard could not read that image.'));
    reader.readAsDataURL(file);
  });
}

export async function createNoteFromImage(file: File, userContext = '') {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image is larger than 8 MB. Choose a smaller image.');

  return analyzeImageToNote(await readAsDataUrl(file), file.name || 'uploaded-image', userContext);
}

export function getClipboardImage(clipboardData: DataTransfer) {
  const imageItem = Array.from(clipboardData.items).find(
    (item) => item.kind === 'file' && item.type.startsWith('image/'),
  );
  return imageItem?.getAsFile() ?? undefined;
}
