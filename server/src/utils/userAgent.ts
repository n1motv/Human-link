/** Lecture sommaire du User-Agent : suffit pour afficher « Chrome · Windows » sans dépendance supplémentaire. */
export interface DeviceInfo {
  browser: string;
  os: string;
  device: 'desktop' | 'mobile' | 'tablet';
}

export function parseUserAgent(ua: string | undefined): DeviceInfo {
  const s = ua ?? '';
  const browser = /Edg(e|A|iOS)?\//.test(s)
    ? 'Edge'
    : /OPR\/|Opera/.test(s)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(s)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(s)
          ? 'Chrome'
          : /Safari\//.test(s)
            ? 'Safari'
            : /curl|wget|python|node|axios|postman/i.test(s)
              ? 'Client technique'
              : 'Navigateur inconnu';
  const os = /Windows/.test(s)
    ? 'Windows'
    : /Android/.test(s)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(s)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(s)
          ? 'macOS'
          : /CrOS/.test(s)
            ? 'ChromeOS'
            : /Linux/.test(s)
              ? 'Linux'
              : 'Système inconnu';
  const device = /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s)) ? 'tablet' : /Mobi|iPhone|Android/.test(s) ? 'mobile' : 'desktop';
  return { browser, os, device };
}

/** Adresse IP partiellement masquée, affichable sans identifier précisément la personne : 203.0.•.• */
export function maskIp(ip: string): string {
  const v4 = ip.replace(/^::ffff:/, '');
  if (v4 === '::1' || v4 === '127.0.0.1') return 'local';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.split('.').slice(0, 2).join('.') + '.•.•';
  return ip.split(':').filter(Boolean).slice(0, 2).join(':') + ':•';
}
