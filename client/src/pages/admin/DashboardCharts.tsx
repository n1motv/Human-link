import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/**
 * Graphiques du tableau de bord. Ce fichier est le SEUL à importer la bibliothèque de graphiques (recharts, ~350 Ko) : le tableau de bord
 * le charge à la demande (lazy), les chiffres s'affichent donc sans attendre les graphiques, et aucune autre page ne les télécharge.
 */

const tooltipStyle = {
  background: 'var(--glass-strong)',
  border: '1px solid var(--glass-border)',
  borderRadius: 12,
  color: 'var(--fg)',
  fontSize: 12,
  backdropFilter: 'blur(12px)',
};

export function LeavesByMonthChart({ data, name }: { data: { m: string; count: number }[]; name: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="m" stroke="var(--fg-subtle)" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis stroke="var(--fg-subtle)" tickLine={false} axisLine={false} allowDecimals={false} fontSize={12} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgb(var(--accent-rgb) / 0.1)', radius: 10 }} />
        <Bar dataKey="count" name={name} fill="url(#bar)" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PresenceChart({ presence }: { presence: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={presence} dataKey="value" innerRadius={62} outerRadius={84} paddingAngle={3} stroke="none" cornerRadius={6}>
          {presence.map((p) => (
            <Cell key={p.name} fill={p.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DepartmentChart({ data, name }: { data: { name: string; count: number }[]; name: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="var(--grid)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} stroke="var(--fg-subtle)" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis type="category" dataKey="name" width={110} stroke="var(--fg-muted)" tickLine={false} axisLine={false} fontSize={12} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgb(var(--accent-rgb) / 0.1)', radius: 10 }} />
        <Bar dataKey="count" name={name} fill="var(--accent)" radius={[0, 8, 8, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
