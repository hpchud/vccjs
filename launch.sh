#!/bin/sh

# run the tool
tooloutput=$(/vccjs/tool.js $@)
if [ "$?" = "0" ]; then
	# if return code is 0, write the cluster.yml and start init
	echo $tooloutput > /run/cluster.yml
	exec /usr/sbin/init
else
	# otherwise, tool just print the output
	echo "$tooloutput"
	exit 1
fi