import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/aiops-doc/', 
  outDir: '../aiops-doc-dist',   
  title: "AIops 文档",
  description: "AIops 项目文档",
  themeConfig: {
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档'
              },
              modal: {
                noResultsText: '无法找到相关结果',
                resetButtonTitle: '清除查询条件',
                footer: {
                  selectText: '选择',
                  navigateText: '切换'
                }
              },
            },
          },
        },
      },
    },
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '首页', link: '/' },
      { text: '文档', link: '/aiops-doc/aiops-projact' },
      { text: '项目演示', link: 'http://47.103.12.12/' },
    ],

     sidebar: {
      // 当用户位于 `guide` 目录时，会显示此侧边栏
      '/aiops-doc/': [
        {
          text: 'AIops项目文档',
          collapsed: false,
          items: [
            { text: '项目文档', link: '/aiops-doc/aiops-projact' },
            { text: '系统架构', link: '/aiops-doc/model-doc/interview-guide' },
            // { text: '架构图', link: '/aiops-doc/model-doc/iarchitecture-diagrams' },
            { text: 'API文档', link: '/aiops-doc/model-doc/api-reference' },
            { text: '企业级架构审计', link: '/aiops-doc/model-doc/architecture-review' },
            { text: '项目跨模块调用合规性审计报告', link: '/aiops-doc/model-doc/audit-cross-module' },
            { text: '项目健康度分析报告', link: '/aiops-doc/model-doc/project-health' },
            { text: '平台安全成熟度评估报告', link: '/aiops-doc/model-doc/security-assessment' },
            { text: '日志开发规范', link: '/aiops-doc/model-doc/logging-spec' },
            { text: '开发问题排查', link: '/aiops-doc/model-doc/troubleshooting-guide' },
            { text: '移动端', link: '/aiops-doc/model-doc/module-mobile' },
            { text: '系统管理',
              collapsed: false,
              items:[
                {text: '权限管理', link: '/aiops-doc/model-doc/module-auth'},
                {text: '代码生成', link: '/aiops-doc/model-doc/module-codegen'},
                //{text: '公告管理', link: '/aiops-doc/model-doc/module-auth'},
                {text: '登录会话', link: '/aiops-doc/model-doc/module-login-management'},
                {text: '配置中心', link: '/aiops-doc/model-doc/module-configuration'},
                {text: '权限清单', link: '/aiops-doc/model-doc/module-permissions'},
              ],
              //link: '/aiops-doc/model-doc/module-auth' 
            },
            { text: '运维中心', 
              collapsed: false,
              items:[
                {text: '服务与巡检', link: '/aiops-doc/model-doc/module-server'},
                {text: 'SSH命令白名单', link: '/aiops-doc/model-doc/ssh-command-whitelist'},
              ],
              //link: '/aiops-doc/model-doc/module-server' 
            
            },
            { text: 'AI管理', 
              collapsed: false,
              items:[
                {text: 'AI分析生成', link: '/aiops-doc/model-doc/module-ai'},
                {text: '大模型调用记录与限额', link: '/aiops-doc/model-doc/module-llm-invoke-log'},
              ],
              //link: '/aiops-doc/model-doc/module-server' 
            
            },
            //{ text: 'AI管理', link: '/aiops-doc/model-doc/module-ai' },
            { text: '前端改造升级', link: '/aiops-doc/model-doc/module-frontend' },
            //{ text: '代码生成器', link: '/aiops-doc/model-doc/module-auth' },
            { text: '数据中心', 
              collapsed: false,
              items:[
                {text: '数据库管理', link: '/aiops-doc/model-doc/module-dbcenter'},
                {text: '数据备份', link: '/aiops-doc/model-doc/module-backup-sync'},
                {text: '数据采集', link: '/aiops-doc/model-doc/module-collector'},
              ],
              //link: '/aiops-doc/model-doc/module-server' 
            
            },
            //{ text: '数据中心', link: '/aiops-doc/model-doc/module-auth' },
            { text: '消息中心', link: '/aiops-doc/model-doc/module-notification' },
            { text: '工单管理', link: '/aiops-doc/model-doc/module-workorder' },
            { text: '存储中心', link: '/aiops-doc/model-doc/module-storage' },
            { text: '统计中心', link: '/aiops-doc/model-doc/module-statistics' },
            // { text: 'Two', link: '/guide/two' }
          ]
        }
      ],
      // '/aiops-doc/api-doc/': [
      //     { text: 'API 文档', link: '/aiops-doc/api-doc/api-reference' },
      // ],
    },
    

    // sidebar: [
    //   {
    //     text: '项目文档',
    //     items: [
    //       // { text: 'aiops项目文档', link: '/aiops-projact' },
    //       { text: 'aiops项目文档',
    //         collapsed: false,
    //         items: [
    //           {text: 'Level 2', link: '/model-doc/troubleshooting-guide'}
    //         ]
    //       },
    //       { text: 'Runtime API Examples', link: '/api-examples' }
    //     ]
    //   },
    //   {
    //     text: 'api文档',
    //     items: [
    //       { text: 'aiopsAPI文档', link: '/aiops-projact' },
    //       { text: 'Runtime API Examples', link: '/api-examples' }
    //     ]
    //   },
    // ],

    socialLinks: [
      //{ icon: 'github', link: 'https://github.com/vuejs/vitepress' },
     // { icon: '项目演示', link: 'http://47.103.12.12/' },
      
    ],
  }
})
