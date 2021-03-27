DELETE FROM akas;
DELETE FROM basics;
DELETE FROM crew;
DELETE FROM episode;
DELETE FROM names;
DELETE FROM principals;
DELETE FROM ratings;


\copy akas from program 'curl https://datasets.imdbws.com/title.akas.tsv.gz | gunzip | tail +2' delimiter E'\t' NULL As '\N';
\copy basics from program 'curl https://datasets.imdbws.com/title.basics.tsv.gz | gunzip | tail +2' delimiter E'\t' NULL As '\N';
\copy crew from program 'curl https://datasets.imdbws.com/title.crew.tsv.gz | gunzip | tail +2' delimiter E'\t' NULL As '\N';
\copy episode from program 'curl https://datasets.imdbws.com/title.episode.tsv.gz | gunzip | tail +2' delimiter E'\t' NULL As '\N';
\copy names from program 'curl https://datasets.imdbws.com/name.basics.tsv.gz | gunzip | tail +2' delimiter E'\t' NULL As '\N';
\copy principals from program 'curl https://datasets.imdbws.com/title.principals.tsv.gz | gunzip | tail +2' delimiter E'\t' NULL As '\N';
\copy ratings from program 'curl https://datasets.imdbws.com/title.ratings.tsv.gz | gunzip | tail +2' delimiter E'\t' NULL As '\N';