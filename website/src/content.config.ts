import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { topicSchema } from 'starlight-sidebar-topics/schema';

export const collections = {
    docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: topicSchema }) })
};

# Automated fix for issue #667: OracleKeyedLabelPlan sometimes can't read a cursor's plan, which has left the cursor cache
