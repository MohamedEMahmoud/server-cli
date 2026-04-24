[program:{{PROGRAM_NAME}}]
command=/usr/local/bin/php {{DIR}}/artisan queue:work --sleep=3 --tries=3
process_name=%(program_name)s
numprocs=1
autostart=true
autorestart=true
startsecs=10
startretries=3
user={{USER}}
redirect_stderr=true
stdout_logfile={{DIR}}/laravel-worker.log
