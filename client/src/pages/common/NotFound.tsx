import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="gradient-text text-8xl font-extrabold">404</p>
        <p className="mt-2 text-lg font-semibold">{t('common.notFound')}</p>
        <Link to="/" className="btn btn-primary mt-6">
          {t('common.goHome')}
        </Link>
      </div>
    </div>
  );
}
