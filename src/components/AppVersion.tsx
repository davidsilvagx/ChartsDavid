import release from '../../app-version.json';
export function AppVersion(){return <small className="app-version" title={`Versão ${release.version}`}>{release.channel==='beta'?'beta · ':''}{release.version}</small>}
