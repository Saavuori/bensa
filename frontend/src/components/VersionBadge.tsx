import { useEffect, useState } from 'react';

type VersionInfo = {
  version: string;
  buildDate: string;
  gitCommit: string;
};

const CHANGELOG_URL = 'https://saavuori.github.io/bensa/';

/**
 * Footer badge showing the running build. The version is injected into the Go
 * binary at image-build time, so in local dev this reads "dev".
 */
function VersionBadge() {
  const [info, setInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/version')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled && data) setInfo(data as VersionInfo);
      })
      .catch(() => {
        /* version is cosmetic — a failed fetch just leaves the badge empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info) return null;

  const built = info.buildDate !== 'unknown' ? new Date(info.buildDate).toLocaleDateString('fi-FI') : null;

  return (
    <div className="version-badge">
      <a href={CHANGELOG_URL} target="_blank" rel="noreferrer">
        {info.version}
      </a>
      {built && <span> · built {built}</span>}
    </div>
  );
}

export default VersionBadge;
