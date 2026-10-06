import type { Router } from 'express';
import { clientConfig } from './config/client.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { bonusesRouter } from './modules/bonuses/bonuses.routes.js';
import { calendarRouter } from './modules/calendar/calendar.routes.js';
import { chatbotRouter } from './modules/chatbot/chatbot.routes.js';
import { contactRouter } from './modules/contact/contact.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { documentsRouter } from './modules/documents/documents.routes.js';
import { feedbackRouter } from './modules/feedback/feedback.routes.js';
import { leavesRouter } from './modules/leaves/leaves.routes.js';
import { mailRouter } from './modules/mail/mail.routes.js';
import { meetingsRouter } from './modules/meetings/meetings.routes.js';
import { monitoringRouter } from './modules/monitoring/monitoring.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { orgRouter } from './modules/org/org.routes.js';
import { rgpdRouter } from './modules/rgpd/rgpd.routes.js';
import { sickRouter } from './modules/sick/sick.routes.js';
import { teleworkRouter } from './modules/telework/telework.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

type ModuleName = keyof typeof clientConfig.modules;

export interface Mount {
  prefix: string;
  router: Router;
  /** Module activable par client (client.config.json → modules) : sans lui, la route n'existe pas. */
  module?: ModuleName;
}

/** Routes montées avant la protection CSRF (publiques : un rapport d'erreur doit pouvoir partir même sans session). */
export const PUBLIC_MOUNTS: Mount[] = [{ prefix: '/api/client-errors', router: monitoringRouter }];

/** Routes de l'API derrière limitation de débit et CSRF. Source unique : sert à monter les routes ET à générer la documentation. */
export const API_MOUNTS: Mount[] = [
  { prefix: '/api/auth', router: authRouter },
  { prefix: '/api/users', router: usersRouter },
  { prefix: '/api/org', router: orgRouter },
  { prefix: '/api/notifications', router: notificationsRouter },
  { prefix: '/api/rgpd', router: rgpdRouter },
  { prefix: '/api/mail-jobs', router: mailRouter },
  { prefix: '/api/dashboard', router: dashboardRouter },
  { prefix: '/api/calendar', router: calendarRouter },
  { prefix: '/api/leaves', router: leavesRouter, module: 'leaves' },
  { prefix: '/api/sick-leaves', router: sickRouter, module: 'sickLeaves' },
  { prefix: '/api/bonuses', router: bonusesRouter, module: 'bonuses' },
  { prefix: '/api/telework', router: teleworkRouter, module: 'telework' },
  { prefix: '/api/meetings', router: meetingsRouter, module: 'meetings' },
  { prefix: '/api/documents', router: documentsRouter, module: 'vault' },
  { prefix: '/api/feedback', router: feedbackRouter, module: 'feedback' },
  { prefix: '/api/contact', router: contactRouter, module: 'contact' },
  { prefix: '/api/chatbot', router: chatbotRouter, module: 'chatbot' },
];
