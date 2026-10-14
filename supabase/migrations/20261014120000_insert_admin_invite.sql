-- Insert admin invite for Jonathan Stevenson

insert into public.admin_invites (email)
values (lower('jonathanstevenson22@gmail.com'))
on conflict do nothing;
