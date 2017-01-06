#!/bin/sh

# run the tool
tooloutput=$(/vccjs/tool.js $@)
if [ "$?" = "0" ]; then
	# if return code is 0, run the init8js daemon to start
	exec $tooloutput
else
	# otherwise, tool just printed informational messages
	echo "$tooloutput"
	exit 1
fi