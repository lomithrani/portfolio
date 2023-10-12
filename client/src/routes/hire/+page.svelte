<script>
	import { Step, Stepper } from '@skeletonlabs/skeleton';
	import { fade } from 'svelte/transition';
</script>

<svelte:head>
	<title>About</title>
	<meta name="description" content="About this app" />
</svelte:head>

<Stepper
	class="w-5/6 mx-auto mt-6"
	transitionIn={fade}
	transitionInParams={{ duration: 200, delay: 100 }}
>
	<Step stepTerm="The job: ">
		<svelte:fragment slot="header">About the Job</svelte:fragment>
		<div class="card p-4 w-full text-token space-y-4">
			<label class="label">
				<span>Input</span>
				<input class="input" type="text" placeholder="Input" />
			</label>
			<label class="label">
				<span>Select</span>
				<select class="select">
					<option value="1">Option 1</option>
					<option value="2">Option 2</option>
					<option value="3">Option 3</option>
					<option value="4">Option 4</option>
					<option value="5">Option 5</option>
				</select>
			</label>
			<label class="label">
				<span>Other details</span>
				<!-- cspell:disable-next-line -->
				<textarea
					class="textarea"
					rows="4"
					placeholder="Lorem ipsum dolor sit amet consectetur adipisicing elit."
				/>
			</label>
		</div>
	</Step>
	<Step stepTerm="The Company: ">
		<svelte:fragment slot="header">About the Company</svelte:fragment>
		(content)
	</Step>
	<!-- ... -->
</Stepper>
