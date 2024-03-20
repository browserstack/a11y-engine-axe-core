# a11y-engine-axe-core
This is a private fork of public Axe core repo: 
https://github.com/dequelabs/axe-core


## How to make changes in axe-core interally
Create a feature branch, add the changes and raise a PR to the `main` branch.

NOTE: `axe-core` public repo already has a master branch, to keep the things clean while merging we avoid make changes on top of it. 


## Using the repo as submodule
To use this repo as a submodule, make sure to use `main` branch as the submodule commit head.

This we way can track the changes in a cleaner way.
For development and development testing however we can rely on some other commits in the submodule.

## Pull latest changes from public axe-core repo

```
# cd into the repo
cd a11y-engine-axe-core 

# Add public axe-core repo as remote public
git remote add public git@github.com:dequelabs/axe-core.git

# Creates a merge commit
git pull public master 

# push the changes to internal private repo
git push origin master
```
