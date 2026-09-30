#!/usr/bin/env ruby
# frozen_string_literal: true
# Anweisungen local static server + Finder pending-open bridge (v1.66)
require 'webrick'
require 'fileutils'
require 'cgi'
require 'json'

ROOT = File.expand_path(__dir__)
PORT = Integer(ENV.fetch('ANWEISUNGEN_PORT', '8765'))
BIND = ENV.fetch('ANWEISUNGEN_BIND', '127.0.0.1')
# Fixed path — must match open-beak.sh (macOS Dir.tmpdir is under /var/folders/...)
INBOX = ENV.fetch('ANWEISUNGEN_INBOX', '/tmp/anweisungen-inbox')
PENDING_FILE = File.join(INBOX, 'pending.beak')
PENDING_META = File.join(INBOX, 'pending.json')

FileUtils.mkdir_p(INBOX)

module AnweisungenPending
  module_function

  def stage(src_path)
    src = File.expand_path(src_path.to_s)
    raise "Datei fehlt: #{src}" unless File.file?(src)
    FileUtils.mkdir_p(INBOX)
    FileUtils.cp(src, PENDING_FILE)
    meta = { 'name' => File.basename(src), 'stagedAt' => Time.now.to_i, 'src' => src }
    File.write(PENDING_META, JSON.generate(meta))
    meta
  end

  def take
    return nil unless File.file?(PENDING_FILE)
    data = File.binread(PENDING_FILE)
    meta = {}
    begin
      meta = JSON.parse(File.read(PENDING_META)) if File.file?(PENDING_META)
    rescue StandardError
      meta = {}
    end
    FileUtils.rm_f(PENDING_FILE)
    FileUtils.rm_f(PENDING_META)
    [data, (meta['name'] || 'Projekt.beak')]
  end
end

if ARGV[0] == '--stage'
  meta = AnweisungenPending.stage(ARGV[1])
  puts JSON.generate(meta)
  exit 0
end

server = WEBrick::HTTPServer.new(
  Port: PORT,
  BindAddress: BIND,
  DocumentRoot: ROOT,
  AccessLog: [],
  Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN)
)

server.mount_proc('/api/pending-beak') do |req, res|
  res['Access-Control-Allow-Origin'] = '*'
  res['Cache-Control'] = 'no-store'
  if req.request_method == 'OPTIONS'
    res.status = 204
    next
  end
  if req.request_method == 'POST'
    name = req['X-Beak-Filename'] || 'Projekt.beak'
    body = req.body
    raise WEBrick::HTTPStatus::BadRequest, 'empty' if body.nil? || body.empty?
    FileUtils.mkdir_p(INBOX)
    File.binwrite(PENDING_FILE, body)
    File.write(PENDING_META, JSON.generate('name' => File.basename(name.to_s)))
    res.status = 204
    next
  end
  taken = AnweisungenPending.take
  if taken.nil?
    res.status = 204
    res.body = ''
    next
  end
  data, name = taken
  res.status = 200
  res['Content-Type'] = 'application/octet-stream'
  res['X-Beak-Filename'] = CGI.escape(name)
  res['Content-Disposition'] = "attachment; filename=\"#{name.gsub('"', '')}\""
  res.body = data
end

mime = WEBrick::HTTPUtils::DefaultMimeTypes.dup
mime['webmanifest'] = 'application/manifest+json'
mime['mjs'] = 'text/javascript'
server.config[:MimeTypes] = mime

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }

$stderr.puts "Anweisungen serve http://#{BIND}:#{PORT}/  root=#{ROOT} inbox=#{INBOX}"
server.start
