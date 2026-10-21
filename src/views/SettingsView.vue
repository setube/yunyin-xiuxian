<template>
  <div class="stagger-in space-y-4 px-4 pb-6 pt-4">
    <SectionTitle title="设置" />

    <!-- 偏好:音频 / 动效 / 遇事勿扰 / 主题 / 战报速度 -->
    <SettingsPreferenceSection />

    <SectionTitle title="存档" />
    <SettingsSaveSection />

    <SectionTitle title="诊断" />
    <SettingsDiagnosticsSection />

    <!-- iOS 专属:装到主屏幕才躲得过系统清存储(非 iOS 不显示,见组件注释) -->
    <InstallToHomeNotice permanent />

    <SectionTitle title="关于" />
    <SettingsAboutSection />
  </div>
</template>

<script setup lang="ts">
  import SectionTitle from '@/components/common/SectionTitle.vue'
  import InstallToHomeNotice from '@/components/common/InstallToHomeNotice.vue'
  import SettingsPreferenceSection from '@/components/settings/SettingsPreferenceSection.vue'
  import SettingsSaveSection from '@/components/settings/SettingsSaveSection.vue'
  import SettingsDiagnosticsSection from '@/components/settings/SettingsDiagnosticsSection.vue'
  import SettingsAboutSection from '@/components/settings/SettingsAboutSection.vue'
</script>
