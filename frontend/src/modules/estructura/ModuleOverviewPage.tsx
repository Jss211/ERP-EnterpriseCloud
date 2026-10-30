import { Link } from 'react-router-dom';
import { erpModules, type ModuleLink } from '../../config/modules';

function ModuleAccess({ link }: { link: ModuleLink }) {
  const content = <>{link.name}{link.path ? ' →' : <span className="ml-2 text-xs font-normal">Próximamente</span>}{link.description && <span className="mt-2 block text-xs font-normal text-slate-500 dark:text-slate-400">{link.description}</span>}</>;
  return link.path
    ? <Link to={link.path} className="rounded-xl border border-slate-200 bg-white p-5 text-sm font-semibold text-blue-700 hover:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300">{content}</Link>
    : <button type="button" disabled className="cursor-not-allowed rounded-xl border border-slate-200 bg-white p-5 text-left text-sm font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">{content}</button>;
}

export function ModuleOverviewPage({ moduleId }: { moduleId: string }) {
  const module = erpModules.find(item => item.id === moduleId)!;
  return <section className="space-y-6 text-slate-800 dark:text-slate-100">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Arquitectura funcional · AlvaPlast</p>
      <h1 className="mt-2 text-2xl font-bold">{module.name}</h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{module.scope}</p>
      <span className="mt-4 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">{module.status === 'Pendiente' ? 'Estructura disponible · Operaciones pendientes' : 'Disponibilidad parcial'}</span>
    </header>
    {module.links.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{module.links.map(link => <ModuleAccess key={link.name} link={link} />)}</div>}
    {!!module.secondaryLinks?.length && <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold">Opciones secundarias</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{module.secondaryLinks.map(link => <ModuleAccess key={link.name} link={link} />)}</div>
    </article>}
    <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold">Alcance pendiente</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-400">{module.pending.map(item => <li key={item}>{item}</li>)}</ul>
    </article>
  </section>;
}
