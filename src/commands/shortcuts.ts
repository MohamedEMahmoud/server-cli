export function runShortcuts(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════════╗
║                    server-cli  —  Shortcut Commands                              ║
╚══════════════════════════════════════════════════════════════════════════════════╝

── Deploy ──────────────────────────────────────────────────────────────────────────
  sn /dir 4990                    =  server next /dir 4990
  snu /dir 4988                   =  server nuxt /dir 4988
  ss /dir 4995                    =  server socket /dir 4995
  ssup /dir                       =  server supervisor /dir

── Auto port ───────────────────────────────────────────────────────────────────────
  sna /dir                        =  server next auto /dir
  snua /dir                       =  server nuxt auto /dir
  ssa /dir                        =  server socket auto /dir
  saa /dir                        =  server auto /dir

── Change domain / port ────────────────────────────────────────────────────────────
  sc --port=4989                  =  server change --port=4989
  snc --port=4991 /dir            =  server next change --port=4991 /dir
  snuc --port=4989 /dir           =  server nuxt change --port=4989 /dir
  ssc --domain=d.com --port=4995  =  server socket change --domain=d.com --port=4995

── Lifecycle ───────────────────────────────────────────────────────────────────────
  sr /dir                         =  server restart /dir
  sr 4988                         =  server restart 4988
  sr all                          =  server restart all
  sst 4988                        =  server stop 4988
  sst app-name                    =  server stop app-name
  sd 4988                         =  server delete 4988
  sd app-name                     =  server delete app-name

── Inspect ─────────────────────────────────────────────────────────────────────────
  sl                              =  server logs              (auto-detect from CWD)
  sl app-name --lines=50          =  server logs app-name --lines=50
  sls                             =  server list
  sstat                           =  server status
  sdr                             =  server doctor

── Utility ─────────────────────────────────────────────────────────────────────────
  sinit --yes                     =  server init --yes
  sup-cli --dry-run               =  server self-update --dry-run
  sver                            =  server --version
  shelp                           =  server --help

── Dry-run wrappers ────────────────────────────────────────────────────────────────
  sn-dry /dir 4990                =  server next --dry-run /dir 4990
  snu-dry /dir 4988               =  server nuxt --dry-run /dir 4988
  ss-dry /dir 4995                =  server socket --dry-run /dir 4995

── Load shortcuts into current shell ───────────────────────────────────────────────
  source /root/.server-cli-aliases
  # or add permanently:
  echo "[ -f /root/.server-cli-aliases ] && source /root/.server-cli-aliases" >> ~/.zshrc
`);
}
