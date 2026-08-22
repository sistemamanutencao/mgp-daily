# MGP Daily v0.1.0

Primeira versão operacional da PWA MGP Daily para organização da manutenção predial.

## Funcionalidades

- Minha Jornada com recomendação da próxima missão
- Priorização automática por Emergência, Alta, Média e Baixa
- Cadastro e edição de tarefas
- Estados: Planejada, Em execução, Interrompida, Aguardando material, Aguardando ambiente, Sábado e Concluída
- Apenas uma tarefa em execução por vez
- Registro do motivo de interrupção
- Fila específica de sábado
- Controle simples de materiais essenciais e estoque mínimo
- Histórico de movimentações
- Persistência local via IndexedDB
- Exportação e importação de backup JSON
- Service Worker para funcionamento offline após o primeiro acesso
- Manifesto PWA e ícones instaláveis

## Testar localmente

Na pasta do projeto, execute:

```bash
python -m http.server 8080
```

Abra `http://localhost:8080` no navegador.

## Publicar

É uma PWA estática: publique todo o conteúdo desta pasta em GitHub Pages, Netlify, Cloudflare Pages ou hospedagem HTTPS equivalente.

## Limitação da v0.1.0

Os dados ficam no navegador/dispositivo atual. Não há sincronização entre dispositivos nesta versão. Use o recurso Histórico > Exportar para manter backups.
