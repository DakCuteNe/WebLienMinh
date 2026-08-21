const ORACLE_2026_DRIVE_ID = '1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm';

for (const url of [
  `https://drive.usercontent.google.com/download?id=${ORACLE_2026_DRIVE_ID}&export=download&confirm=t`,
  `https://drive.google.com/uc?export=download&id=${ORACLE_2026_DRIVE_ID}&confirm=t`
]) {
  try {
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-65535', 'User-Agent': 'WebLienMinh/3.23 oracle-drive-probe' },
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000)
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const raw = buffer.toString('utf8');
    const firstLine = raw.split(/\r?\n/, 1)[0] || '';
    console.log(JSON.stringify({
      oracleDriveProbe: url.split('?')[0],
      status: response.status,
      finalHost: new URL(response.url).hostname,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
      contentRange: response.headers.get('content-range'),
      bytesRead: buffer.length,
      headerHasGameId: /(?:^|,)gameid(?:,|$)/i.test(firstLine),
      headerHasBans: /(?:^|,)ban1(?:,|$)/i.test(firstLine) && /(?:^|,)ban5(?:,|$)/i.test(firstLine),
      headerPreview: firstLine.slice(0, 700)
    }));
  } catch (error) {
    console.log(JSON.stringify({ oracleDriveProbe: url.split('?')[0], error: error.message, cause: error?.cause?.message || null }));
  }
}
