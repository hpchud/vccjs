#!/bin/bash

# generate the /var/spool/torque/server_priv/nodes file

echo -n > /var/spool/torque/server_priv/nodes

cat /etc/hosts.vcc | while read line; do
	host="`echo $line | awk '{print $2}'`"
	if [ "$host" != "`hostname`" ]; then
		# torque can not handle a hostname that starts with a number,
		# so we prepend vccnode and ClusterDNS will alias this for us
		echo "vccnode$host" >> /var/spool/torque/server_priv/nodes
	fi
done

# kill the torque server without stopping jobs
qterm -t quick
