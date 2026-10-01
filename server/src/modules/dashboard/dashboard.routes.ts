import { Router } from 'express';
import { BonusRequest } from '../../models/BonusRequest.js';
import { LeaveRequest } from '../../models/LeaveRequest.js';
import { SickLeave } from '../../models/SickLeave.js';
import { Telework } from '../../models/Telework.js';
import { User } from '../../models/User.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { audit } from '../../utils/audit.js';
import { today } from '../../utils/dates.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth(), requireRole('admin'));

dashboardRouter.get('/admin', async (req, res) => {
  const day = today();
  const staff = { role: { $ne: 'admin' }, status: 'active' } as const;
  const [users, acceptedLeaves, onLeaveToday, onSickToday, teleworkToday, pending] = await Promise.all([
    User.find(staff), // salaire chiffré : la moyenne se calcule côté application
    LeaveRequest.find({ statut: 'accepte' }, 'dateDebut dateFin'),
    LeaveRequest.distinct('userId', { statut: 'accepte', dateDebut: { $lte: day }, dateFin: { $gte: day } }),
    SickLeave.distinct('userId', { statut: 'accepte', dateDebut: { $lte: day }, dateFin: { $gte: day } }),
    Telework.distinct('userId', { date: day }),
    Promise.all([
      LeaveRequest.countDocuments({ statut: 'en attente', statutManager: 'accepte' }),
      SickLeave.countDocuments({ statut: 'en attente' }),
      BonusRequest.countDocuments({ statut: 'en attente' }),
    ]),
  ]);

  const salaries = users.map((u) => u.salaire).filter((s): s is number => typeof s === 'number');
  const averageSalary = salaries.length ? Math.round((salaries.reduce((a, b) => a + b, 0) / salaries.length) * 100) / 100 : 0;

  const byDepartment = new Map<string, number>();
  for (const u of users) byDepartment.set(u.departement || '—', (byDepartment.get(u.departement || '—') ?? 0) + 1);

  const leavesByMonth = Array.from({ length: 12 }, () => 0);
  for (const l of acceptedLeaves) {
    const m = Number(l.dateDebut.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) leavesByMonth[m]! += 1;
  }

  const absent = new Set([...onLeaveToday, ...onSickToday].map(String));
  const remote = new Set(teleworkToday.map(String));
  const activeIds = users.map((u) => String(u._id));
  const remoteCount = activeIds.filter((id) => remote.has(id) && !absent.has(id)).length;
  const absentCount = activeIds.filter((id) => absent.has(id)).length;

  await audit(req, { action: 'dashboard.admin', targetType: 'dashboard' }); // agrégats de salaires : lecture tracée
  res.json({
    totalEmployees: users.length,
    totalDepartments: byDepartment.size,
    acceptedLeaves: acceptedLeaves.length,
    averageSalary,
    leavesByMonth,
    byDepartment: [...byDepartment.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    today: { onSite: activeIds.length - remoteCount - absentCount, remote: remoteCount, absent: absentCount },
    pending: { leaves: pending[0], sick: pending[1], bonuses: pending[2] },
    viewer: authOf(req).userId,
  });
});
