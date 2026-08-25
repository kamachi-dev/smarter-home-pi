import { getDashboardHtmlTemplate } from './html.js';
import { dashboardClientScript } from './clientScript.js';

export const dashboardHtml: string = getDashboardHtmlTemplate(dashboardClientScript);
