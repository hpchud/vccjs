FROM ubuntu:xenial

ENV http_proxy http://wwwproxy.hud.ac.uk:3128
ENV https_proxy http://wwwproxy.hud.ac.uk:3128

# install packages required
RUN apt-get update \
	&& apt-get install --yes --force-yes --no-install-recommends \
	build-essential \
	git \
	iproute2 \
	iputils-ping \
	dnsutils \
	nano \
	vim \
	curl \
	ca-certificates \
	openssh-server

# install n
WORKDIR /
RUN git clone https://github.com/tj/n.git \
	&& cd n \
	&& make \
	&& make install \
	&& cd .. \
	&& rm -r n

# use n to install node 0.10 
RUN n 0.10

# install init8js
WORKDIR /
RUN git clone https://github.com/joshiggins/init8js.git \
	&& cd init8js \
	&& git checkout -q 0a5e8cc88fd2c390dccae1baa75773976fc4ce24
WORKDIR /init8js
RUN npm install
RUN cp -r node_modules /lib/

# install vccjs
COPY . /vccjs
WORKDIR /vccjs
RUN rm -r node_modules
RUN npm install

# install configuration files
COPY init.yml /etc/init.yml
COPY services.yml /etc/services.yml

WORKDIR /
#ENTRYPOINT ["node", "/init8js/init.js"]