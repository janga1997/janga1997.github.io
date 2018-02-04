## declare an array variable
directory='js/custom/'
declare -a arr=("load" "abaqus" "mitchell")

## now loop through the above array
for i in "${arr[@]}"
do
   uglifyjs "js/$i.js" > "$directory$i.min.js"
   # or do whatever with individual element of the array
done