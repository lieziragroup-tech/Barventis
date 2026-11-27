/**
 * useCompanyTemplate
 * Loads the company's TemplateConfig from Firestore once per mount.
 * Returns undefined while loading, then the resolved config.
 * Falls back to TEMPLATE_DEFAULTS if not set.
 */
import { useState, useEffect } from "react";
import { useAuthStore } from '@/app/store/authStore';
import { getCompanySettings, TEMPLATE_DEFAULTS } from '@/shared/api/settingsService';
import type { TemplateConfig } from '@/shared/api/settingsService';

export function useCompanyTemplate(): TemplateConfig | undefined {
    const { user } = useAuthStore();
    const [tpl, setTpl] = useState<TemplateConfig | undefined>(undefined);

    useEffect(() => {
        if (!user?.companyId) {
            setTpl({ ...TEMPLATE_DEFAULTS });
            return;
        }
        getCompanySettings(user.companyId)
            .then(settings => setTpl({ ...TEMPLATE_DEFAULTS, ...(settings.template ?? {}) }))
            .catch(() => setTpl({ ...TEMPLATE_DEFAULTS }));
    }, [user?.companyId]);

    return tpl;
}